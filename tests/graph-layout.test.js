import { readFileSync, existsSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

// Preserve both marker pairs when integrating; no browser or plugin boot needed.
const snippet = new URL('../graph-layout.snippet.js', import.meta.url)
const source = readFileSync(existsSync(snippet) ? snippet : new URL('../client.js', import.meta.url), 'utf8')
const extract = name => {
  const text = source.split(`// BEGIN ${name}`)[1]?.split(`// END ${name}`)[0]
  assert.ok(text, `${name} extraction markers must remain in client.js`)
  return text
}
const { layout, graphEdgePath, GraphCanvas } = runInNewContext(`
  const ROW_H=26, LANE_W=14, LANE_X0=12, DOT_R=4;
  const laneColor = slot => 'color-' + slot;
  const h = (tag, props, ...children) => ({tag, props, children});
  ${extract('GRAPH LAYOUT')}
  ${extract('GRAPH CANVAS')}
  ;({layout, graphEdgePath, GraphCanvas})`)
const own = value => JSON.parse(JSON.stringify(value))
const commits = (...records) => records.map(([hash, ...parents]) => ({ hash, parents }))
const edgeFor = (graph, child, parent) => graph.edges.find(edge => graph.rows[edge.from.row].commit.hash === child && edge.parent === parent)

function valid(graph) {
  for (const edge of graph.edges) {
    assert.equal(edge.from.column, graph.rows[edge.from.row].column)
    assert.ok(edge.column >= 0 && edge.column < graph.columnCount)
    if (edge.to !== null) {
      assert.ok(edge.to.row > edge.from.row)
      assert.equal(edge.to.column, graph.rows[edge.to.row].column)
      assert.equal(edge.parent, graph.rows[edge.to.row].commit.hash)
    }
    const path = graphEdgePath(edge, graph.rows.length)
    assert.ok(!/NaN|undefined|Infinity/.test(path))
    const numbers = path.match(/-?\d+(?:\.\d+)?/g).map(Number)
    assert.deepEqual(numbers.slice(0, 2), [12 + edge.from.column * 14, edge.from.row * 26 + 13])
    assert.deepEqual(numbers.slice(-2), [12 + (edge.to?.column ?? edge.column) * 14, edge.to === null ? graph.rows.length * 26 : edge.to.row * 26 + 13])
    const end = edge.to?.row ?? graph.rows.length
    for (let row = edge.from.row + 1; row < end; row++) {
      assert.notEqual(graph.rows[row].column, edge.column, `reserved track crosses unrelated dot at ${row}`)
    }
  }
  // Overlapping vertical tracks are legal only when bundled to the SAME parent
  // with the SAME colour; no invisible lane release/reuse along a long edge.
  for (let i = 0; i < graph.edges.length; i++) {
    const a = graph.edges[i]
    for (const b of graph.edges.slice(i + 1)) {
      const lo = Math.max(a.from.row, b.from.row)
      const hi = Math.min(a.to?.row ?? graph.rows.length, b.to?.row ?? graph.rows.length)
      if (a.column === b.column && lo < hi) {
        assert.equal(a.parent, b.parent)
        assert.equal(a.slot, b.slot)
      }
    }
  }
}

test('linear first-parent spine has one fixed lane and colour', () => {
  const graph = layout(commits(['a', 'b'], ['b', 'c'], ['c']), false)
  assert.equal(graph.columnCount, 1)
  assert.deepEqual(own(graph.rows.map(row => [row.column, row.slot])), [[0, 0], [0, 0], [0, 0]])
  assert.equal(graph.edges.length, 2)
  assert.equal(graphEdgePath(graph.edges[0], 3), 'M 12 13 L 12 39')
  valid(graph)
})

test('diamond splits at merge child and source curve lands on shared parent dot', () => {
  const graph = layout(commits(['m', 'a', 'b'], ['b', 'r'], ['a', 'r'], ['r']), false)
  assert.equal(graph.columnCount, 2)
  assert.deepEqual(own(graph.rows.map(row => row.column)), [0, 1, 0, 0])
  const split = edgeFor(graph, 'm', 'b')
  const join = edgeFor(graph, 'b', 'r')
  assert.equal(graphEdgePath(split, 4), 'M 12 13 C 12 19 26 17 26 23 L 26 39')
  assert.equal(graphEdgePath(join, 4), 'M 26 39 L 26 81 C 26 87 12 85 12 91')
  assert.equal(split.slot, graph.rows[1].slot)
  assert.deepEqual(own(join.to), { row: 3, column: 0 })
  valid(graph)
})

test('long fork reserves its rail until actual source, not one row after child', () => {
  const records = [['m', 'a0', 'topic'], ['topic', 'root']]
  for (let i = 0; i < 40; i++) records.push([`a${i}`, i === 39 ? 'root' : `a${i + 1}`])
  records.push(['root'])
  const graph = layout(commits(...records), false)
  const edge = edgeFor(graph, 'topic', 'root')
  assert.equal(graph.columnCount, 2)
  assert.equal(edge.column, 1)
  assert.equal(edge.to.row, 42)
  assert.equal(graph.rows[42].column, 0)
  assert.match(graphEdgePath(edge, 43), /L 26 1095 C 26 1101 12 1099 12 1105$/)
  valid(graph)
})

test('octopus keeps all parent identities and exact destinations', () => {
  const graph = layout(commits(['m', 'a', 'b', 'c', 'd'], ['d', 'r'], ['c', 'r'], ['b', 'r'], ['a', 'r'], ['r']), false)
  assert.equal(graph.columnCount, 4)
  assert.equal(graph.edges.filter(edge => edge.from.row === 0).length, 4)
  for (const parent of ['a', 'b', 'c', 'd']) assert.ok(edgeFor(graph, 'm', parent))
  assert.equal(graph.rows.at(-1).slot, 0)
  valid(graph)
})

test('many converging topics share a return rail instead of historical columns', () => {
  const records = []
  for (let i = 0; i < 60; i++) {
    records.push([`m${i}`, i === 59 ? 'r' : `m${i + 1}`, `t${i}`], [`t${i}`, 'r'])
  }
  records.push(['r'])
  const graph = layout(commits(...records), false)
  assert.equal(graph.columnCount, 3)
  assert.equal(graph.rows.at(-1).column, 0)
  assert.equal(graph.rows.at(-1).slot, 0)
  for (let i = 0; i < 60; i++) {
    assert.equal(graph.rows[i * 2].column, 0)
    assert.equal(graph.rows[i * 2].slot, 0)
  }
  valid(graph)
})

test('incomplete page continuations reach bottom in reserved lanes; extension is stable', () => {
  const records = commits(['m', 'a', 'b'], ['b', 'r'], ['a', 'r'], ['r', 'z'], ['z'])
  const page = layout(records.slice(0, 2), true)
  assert.equal(page.edges.filter(edge => edge.to === null).length, 2)
  for (const edge of page.edges.filter(edge => edge.to === null)) assert.ok(graphEdgePath(edge, 2).endsWith(' 52'))
  const full = layout(records, false)
  assert.deepEqual(own(page.rows.map(({ column, slot }) => ({ column, slot }))), own(full.rows.slice(0, 2).map(({ column, slot }) => ({ column, slot }))))
  assert.equal(layout(commits(['a', 'unloaded']), false).edges.length, 0)
  valid(page)
  valid(full)
})

test('disconnected references do not steal live lanes and reuse completed components', () => {
  const graph = layout(commits(['a', 'r'], ['x', 'y'], ['y'], ['r'], ['z']), false)
  assert.deepEqual(own(graph.rows.map(row => row.column)), [0, 1, 1, 0, 0])
  assert.notEqual(graph.rows[0].slot, graph.rows[1].slot)
  assert.equal(graph.columnCount, 2)
  valid(graph)
})

test('serial diamonds reuse tracks without losing node or edge colours', () => {
  const records = []
  for (let i = 0; i < 80; i++) {
    const root = i === 79 ? 'r' : `m${i + 1}`
    records.push([`m${i}`, `a${i}`, `b${i}`], [`b${i}`, root], [`a${i}`, root])
  }
  records.push(['r'])
  const graph = layout(commits(...records), false)
  assert.equal(graph.columnCount, 2)
  for (const row of graph.rows.filter(row => row.commit.hash.startsWith('a') || row.commit.hash.startsWith('m'))) {
    assert.equal(row.column, 0)
    assert.equal(row.slot, 0)
  }
  valid(graph)
})

test('canvas paths and dots stay within the reserved graph width', () => {
  const graph = layout(commits(['m', 'a', 'b'], ['b', 'r'], ['a', 'r'], ['r']), false)
  const canvas = GraphCanvas({ ...graph, height: graph.rows.length * 26 })
  assert.equal(canvas.props.width, 52)
  assert.equal(canvas.props.viewBox, '0 0 52 104')
  assert.equal(canvas.children[0].length, graph.edges.length)
  assert.equal(canvas.children[1].length, graph.rows.length)
  for (const path of canvas.children[0]) assert.equal(path.props.strokeLinecap, 'round')
  for (const dot of canvas.children[1]) assert.ok(dot.props.cx + dot.props.r < canvas.props.width)
})

test('empty graph is safe', () => {
  const graph = layout([], false)
  assert.equal(graph.columnCount, 1)
  assert.equal(graph.edges.length, 0)
  assert.equal(graph.rows.length, 0)
})

// Optional local regression. All preceding tests are pure and run in any checkout.
// Read-only git log matches internals.listCommits's --topo-order --all traversal.
const repository = process.env.GRAPH_TEST_REPO
for (const limit of [120, 600]) test(`real history ${limit}: exact endpoints and bounded live width`, { skip: !repository }, () => {
  const lines = execFileSync('git', ['-C', repository, 'log', '--topo-order', '--all', `--max-count=${limit}`, '--format=%H %P'], { encoding: 'utf8' }).trim()
  const records = lines ? commits(...lines.split('\n').map(line => line.split(' '))) : []
  const graph = layout(records, records.length === limit)
  console.log(`graph ${limit}: ${graph.rows.length} rows, ${graph.columnCount} columns, ${graph.edges.length} edges`)
  assert.ok(graph.columnCount <= 20, `unexpected width ${graph.columnCount}`)
  const byHash = new Map(graph.rows.map(row => [row.commit.hash, row]))
  let row = graph.rows[0]
  while (row) {
    assert.equal(row.column, 0)
    assert.equal(row.slot, 0)
    row = byHash.get(row.commit.parents[0])
  }
  valid(graph)
})
