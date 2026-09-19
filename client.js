/**
 * Browser half of `dsh-git-graph`: Git views in the right Sidebar.
 *
 * Persistent history and working-change browsers keep graph, files and diff
 * visible in resizable panes. Selecting a commit or file updates the existing
 * inspector rather than opening a new tab. Legacy tab links remain supported.
 *
 * The graph is drawn as SVG lanes. A commit's lane is decided by the order the
 * commits arrive in and by its parents: a commit continues its first parent's
 * lane, and every additional parent opens a branch that rejoins later. The
 * layout is a pure function of the commit page, so a page that grows by loading
 * more commits is laid out from scratch rather than patched.
 *
 * This half never runs git and never writes. It asks the host half, which
 * resolves the Session's own workspace and refuses everything else.
 *
 * @module dsh-git-graph/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-git-graph',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h } = React

    // BEGIN BUNDLED SYNTAX
var GitSyntax=(()=>{var Fn=Object.create;var le=Object.defineProperty;var Hn=Object.getOwnPropertyDescriptor;var Gn=Object.getOwnPropertyNames;var Kn=Object.getPrototypeOf,Wn=Object.prototype.hasOwnProperty;var Zn=(e,n)=>()=>(n||e((n={exports:{}}).exports,n),n.exports),Yn=(e,n)=>{for(var t in n)le(e,t,{get:n[t],enumerable:!0})},Le=(e,n,t,i)=>{if(n&&typeof n=="object"||typeof n=="function")for(let l of Gn(n))!Wn.call(e,l)&&l!==t&&le(e,l,{get:()=>n[l],enumerable:!(i=Hn(n,l))||i.enumerable});return e};var qn=(e,n,t)=>(t=e!=null?Fn(Kn(e)):{},Le(n||!e||!e.__esModule?le(t,"default",{value:e,enumerable:!0}):t,e)),Xn=e=>Le(le({},"__esModule",{value:!0}),e);var en=Zn((ti,je)=>{function Fe(e){return e instanceof Map?e.clear=e.delete=e.set=function(){throw new Error("map is read-only")}:e instanceof Set&&(e.add=e.clear=e.delete=function(){throw new Error("set is read-only")}),Object.freeze(e),Object.getOwnPropertyNames(e).forEach(n=>{let t=e[n],i=typeof t;(i==="object"||i==="function")&&!Object.isFrozen(t)&&Fe(t)}),e}var de=class{constructor(n){n.data===void 0&&(n.data={}),this.data=n.data,this.isMatchIgnored=!1}ignoreMatch(){this.isMatchIgnored=!0}};function He(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;")}function Z(e,...n){let t=Object.create(null);for(let i in e)t[i]=e[i];return n.forEach(function(i){for(let l in i)t[l]=i[l]}),t}var Qn="</span>",De=e=>!!e.scope,Vn=(e,{prefix:n})=>{if(e.startsWith("language:"))return e.replace("language:","language-");if(e.includes(".")){let t=e.split(".");return[`${n}${t.shift()}`,...t.map((i,l)=>`${i}${"_".repeat(l+1)}`)].join(" ")}return`${n}${e}`},Se=class{constructor(n,t){this.buffer="",this.classPrefix=t.classPrefix,n.walk(this)}addText(n){this.buffer+=He(n)}openNode(n){if(!De(n))return;let t=Vn(n.scope,{prefix:this.classPrefix});this.span(t)}closeNode(n){De(n)&&(this.buffer+=Qn)}value(){return this.buffer}span(n){this.buffer+=`<span class="${n}">`}},Be=(e={})=>{let n={children:[]};return Object.assign(n,e),n},Te=class e{constructor(){this.rootNode=Be(),this.stack=[this.rootNode]}get top(){return this.stack[this.stack.length-1]}get root(){return this.rootNode}add(n){this.top.children.push(n)}openNode(n){let t=Be({scope:n});this.add(t),this.stack.push(t)}closeNode(){if(this.stack.length>1)return this.stack.pop()}closeAllNodes(){for(;this.closeNode(););}toJSON(){return JSON.stringify(this.rootNode,null,4)}walk(n){return this.constructor._walk(n,this.rootNode)}static _walk(n,t){return typeof t=="string"?n.addText(t):t.children&&(n.openNode(t),t.children.forEach(i=>this._walk(n,i)),n.closeNode(t)),n}static _collapse(n){typeof n!="string"&&n.children&&(n.children.every(t=>typeof t=="string")?n.children=[n.children.join("")]:n.children.forEach(t=>{e._collapse(t)}))}},Ae=class extends Te{constructor(n){super(),this.options=n}addText(n){n!==""&&this.add(n)}startScope(n){this.openNode(n)}endScope(){this.closeNode()}__addSublanguage(n,t){let i=n.root;t&&(i.scope=`language:${t}`),this.add(i)}toHTML(){return new Se(this,this.options).value()}finalize(){return this.closeAllNodes(),!0}};function re(e){return e?typeof e=="string"?e:e.source:null}function Ge(e){return Q("(?=",e,")")}function Jn(e){return Q("(?:",e,")*")}function jn(e){return Q("(?:",e,")?")}function Q(...e){return e.map(t=>re(t)).join("")}function et(e){let n=e[e.length-1];return typeof n=="object"&&n.constructor===Object?(e.splice(e.length-1,1),n):{}}function Oe(...e){return"("+(et(e).capture?"":"?:")+e.map(i=>re(i)).join("|")+")"}function Ke(e){return new RegExp(e.toString()+"|").exec("").length-1}function nt(e,n){let t=e&&e.exec(n);return t&&t.index===0}var tt=/\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;function Re(e,{joinWith:n}){let t=0;return e.map(i=>{t+=1;let l=t,u=re(i),r="";for(;u.length>0;){let a=tt.exec(u);if(!a){r+=u;break}r+=u.substring(0,a.index),u=u.substring(a.index+a[0].length),a[0][0]==="\\"&&a[1]?r+="\\"+String(Number(a[1])+l):(r+=a[0],a[0]==="("&&t++)}return r}).map(i=>`(${i})`).join(n)}var it=/\b\B/,We="[a-zA-Z]\\w*",we="[a-zA-Z_]\\w*",Ze="\\b\\d+(\\.\\d+)?",Ye="(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)",qe="\\b(0b[01]+)",at="!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~",rt=(e={})=>{let n=/^#![ ]*\//;return e.binary&&(e.begin=Q(n,/.*\b/,e.binary,/\b.*/)),Z({scope:"meta",begin:n,end:/$/,relevance:0,"on:begin":(t,i)=>{t.index!==0&&i.ignoreMatch()}},e)},se={begin:"\\\\[\\s\\S]",relevance:0},st={scope:"string",begin:"'",end:"'",illegal:"\\n",contains:[se]},ot={scope:"string",begin:'"',end:'"',illegal:"\\n",contains:[se]},ct={begin:/\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/},be=function(e,n,t={}){let i=Z({scope:"comment",begin:e,end:n,contains:[]},t);i.contains.push({scope:"doctag",begin:"[ ]*(?=(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):)",end:/(TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):/,excludeBegin:!0,relevance:0});let l=Oe("I","a","is","so","us","to","at","if","in","it","on",/[A-Za-z]+['](d|ve|re|ll|t|s|n)/,/[A-Za-z]+[-][a-z]+/,/[A-Za-z][a-z]{2,}/);return i.contains.push({begin:Q(/[ ]+/,"(",l,/[.]?[:]?([.][ ]|[ ])/,"){3}")}),i},lt=be("//","$"),ut=be("/\\*","\\*/"),dt=be("#","$"),gt={scope:"number",begin:Ze,relevance:0},bt={scope:"number",begin:Ye,relevance:0},ft={scope:"number",begin:qe,relevance:0},pt={scope:"regexp",begin:/\/(?=[^/\n]*\/)/,end:/\/[gimuy]*/,contains:[se,{begin:/\[/,end:/\]/,relevance:0,contains:[se]}]},mt={scope:"title",begin:We,relevance:0},_t={scope:"title",begin:we,relevance:0},Et={begin:"\\.\\s*"+we,relevance:0},ht=function(e){return Object.assign(e,{"on:begin":(n,t)=>{t.data._beginMatch=n[1]},"on:end":(n,t)=>{t.data._beginMatch!==n[1]&&t.ignoreMatch()}})},ue=Object.freeze({__proto__:null,APOS_STRING_MODE:st,BACKSLASH_ESCAPE:se,BINARY_NUMBER_MODE:ft,BINARY_NUMBER_RE:qe,COMMENT:be,C_BLOCK_COMMENT_MODE:ut,C_LINE_COMMENT_MODE:lt,C_NUMBER_MODE:bt,C_NUMBER_RE:Ye,END_SAME_AS_BEGIN:ht,HASH_COMMENT_MODE:dt,IDENT_RE:We,MATCH_NOTHING_RE:it,METHOD_GUARD:Et,NUMBER_MODE:gt,NUMBER_RE:Ze,PHRASAL_WORDS_MODE:ct,QUOTE_STRING_MODE:ot,REGEXP_MODE:pt,RE_STARTERS_RE:at,SHEBANG:rt,TITLE_MODE:mt,UNDERSCORE_IDENT_RE:we,UNDERSCORE_TITLE_MODE:_t});function Nt(e,n){e.input[e.index-1]==="."&&n.ignoreMatch()}function yt(e,n){e.className!==void 0&&(e.scope=e.className,delete e.className)}function St(e,n){n&&e.beginKeywords&&(e.begin="\\b("+e.beginKeywords.split(" ").join("|")+")(?!\\.)(?=\\b|\\s)",e.__beforeBegin=Nt,e.keywords=e.keywords||e.beginKeywords,delete e.beginKeywords,e.relevance===void 0&&(e.relevance=0))}function Tt(e,n){Array.isArray(e.illegal)&&(e.illegal=Oe(...e.illegal))}function At(e,n){if(e.match){if(e.begin||e.end)throw new Error("begin & end are not supported with match");e.begin=e.match,delete e.match}}function vt(e,n){e.relevance===void 0&&(e.relevance=1)}var Ot=(e,n)=>{if(!e.beforeMatch)return;if(e.starts)throw new Error("beforeMatch cannot be used with starts");let t=Object.assign({},e);Object.keys(e).forEach(i=>{delete e[i]}),e.keywords=t.keywords,e.begin=Q(t.beforeMatch,Ge(t.begin)),e.starts={relevance:0,contains:[Object.assign(t,{endsParent:!0})]},e.relevance=0,delete t.beforeMatch},Rt=["of","and","for","in","not","or","if","then","parent","list","value"],wt="keyword";function Xe(e,n,t=wt){let i=Object.create(null);return typeof e=="string"?l(t,e.split(" ")):Array.isArray(e)?l(t,e):Object.keys(e).forEach(function(u){Object.assign(i,Xe(e[u],n,u))}),i;function l(u,r){n&&(r=r.map(a=>a.toLowerCase())),r.forEach(function(a){let s=a.split("|");i[s[0]]=[u,xt(s[0],s[1])]})}}function xt(e,n){return n?Number(n):Mt(e)?0:1}function Mt(e){return Rt.includes(e.toLowerCase())}var Ue={},X=e=>{console.error(e)},Pe=(e,...n)=>{console.log(`WARN: ${e}`,...n)},J=(e,n)=>{Ue[`${e}/${n}`]||(console.log(`Deprecated as of ${e}. ${n}`),Ue[`${e}/${n}`]=!0)},ge=new Error;function Qe(e,n,{key:t}){let i=0,l=e[t],u={},r={};for(let a=1;a<=n.length;a++)r[a+i]=l[a],u[a+i]=!0,i+=Ke(n[a-1]);e[t]=r,e[t]._emit=u,e[t]._multi=!0}function kt(e){if(Array.isArray(e.begin)){if(e.skip||e.excludeBegin||e.returnBegin)throw X("skip, excludeBegin, returnBegin not compatible with beginScope: {}"),ge;if(typeof e.beginScope!="object"||e.beginScope===null)throw X("beginScope must be object"),ge;Qe(e,e.begin,{key:"beginScope"}),e.begin=Re(e.begin,{joinWith:""})}}function It(e){if(Array.isArray(e.end)){if(e.skip||e.excludeEnd||e.returnEnd)throw X("skip, excludeEnd, returnEnd not compatible with endScope: {}"),ge;if(typeof e.endScope!="object"||e.endScope===null)throw X("endScope must be object"),ge;Qe(e,e.end,{key:"endScope"}),e.end=Re(e.end,{joinWith:""})}}function Ct(e){e.scope&&typeof e.scope=="object"&&e.scope!==null&&(e.beginScope=e.scope,delete e.scope)}function Lt(e){Ct(e),typeof e.beginScope=="string"&&(e.beginScope={_wrap:e.beginScope}),typeof e.endScope=="string"&&(e.endScope={_wrap:e.endScope}),kt(e),It(e)}function Dt(e){function n(r,a){return new RegExp(re(r),"m"+(e.case_insensitive?"i":"")+(e.unicodeRegex?"u":"")+(a?"g":""))}class t{constructor(){this.matchIndexes={},this.regexes=[],this.matchAt=1,this.position=0}addRule(a,s){s.position=this.position++,this.matchIndexes[this.matchAt]=s,this.regexes.push([s,a]),this.matchAt+=Ke(a)+1}compile(){this.regexes.length===0&&(this.exec=()=>null);let a=this.regexes.map(s=>s[1]);this.matcherRe=n(Re(a,{joinWith:"|"}),!0),this.lastIndex=0}exec(a){this.matcherRe.lastIndex=this.lastIndex;let s=this.matcherRe.exec(a);if(!s)return null;let d=s.findIndex((N,h)=>h>0&&N!==void 0),b=this.matchIndexes[d];return s.splice(0,d),Object.assign(s,b)}}class i{constructor(){this.rules=[],this.multiRegexes=[],this.count=0,this.lastIndex=0,this.regexIndex=0}getMatcher(a){if(this.multiRegexes[a])return this.multiRegexes[a];let s=new t;return this.rules.slice(a).forEach(([d,b])=>s.addRule(d,b)),s.compile(),this.multiRegexes[a]=s,s}resumingScanAtSamePosition(){return this.regexIndex!==0}considerAll(){this.regexIndex=0}addRule(a,s){this.rules.push([a,s]),s.type==="begin"&&this.count++}exec(a){let s=this.getMatcher(this.regexIndex);s.lastIndex=this.lastIndex;let d=s.exec(a);if(this.resumingScanAtSamePosition()&&!(d&&d.index===this.lastIndex)){let b=this.getMatcher(0);b.lastIndex=this.lastIndex+1,d=b.exec(a)}return d&&(this.regexIndex+=d.position+1,this.regexIndex===this.count&&this.considerAll()),d}}function l(r){let a=new i;return r.contains.forEach(s=>a.addRule(s.begin,{rule:s,type:"begin"})),r.terminatorEnd&&a.addRule(r.terminatorEnd,{type:"end"}),r.illegal&&a.addRule(r.illegal,{type:"illegal"}),a}function u(r,a){let s=r;if(r.isCompiled)return s;[yt,At,Lt,Ot].forEach(b=>b(r,a)),e.compilerExtensions.forEach(b=>b(r,a)),r.__beforeBegin=null,[St,Tt,vt].forEach(b=>b(r,a)),r.isCompiled=!0;let d=null;return typeof r.keywords=="object"&&r.keywords.$pattern&&(r.keywords=Object.assign({},r.keywords),d=r.keywords.$pattern,delete r.keywords.$pattern),d=d||/\w+/,r.keywords&&(r.keywords=Xe(r.keywords,e.case_insensitive)),s.keywordPatternRe=n(d,!0),a&&(r.begin||(r.begin=/\B|\b/),s.beginRe=n(s.begin),!r.end&&!r.endsWithParent&&(r.end=/\B|\b/),r.end&&(s.endRe=n(s.end)),s.terminatorEnd=re(s.end)||"",r.endsWithParent&&a.terminatorEnd&&(s.terminatorEnd+=(r.end?"|":"")+a.terminatorEnd)),r.illegal&&(s.illegalRe=n(r.illegal)),r.contains||(r.contains=[]),r.contains=[].concat(...r.contains.map(function(b){return Bt(b==="self"?r:b)})),r.contains.forEach(function(b){u(b,s)}),r.starts&&u(r.starts,a),s.matcher=l(s),s}if(e.compilerExtensions||(e.compilerExtensions=[]),e.contains&&e.contains.includes("self"))throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");return e.classNameAliases=Z(e.classNameAliases||{}),u(e)}function Ve(e){return e?e.endsWithParent||Ve(e.starts):!1}function Bt(e){return e.variants&&!e.cachedVariants&&(e.cachedVariants=e.variants.map(function(n){return Z(e,{variants:null},n)})),e.cachedVariants?e.cachedVariants:Ve(e)?Z(e,{starts:e.starts?Z(e.starts):null}):Object.isFrozen(e)?Z(e):e}var Ut="11.11.1",ve=class extends Error{constructor(n,t){super(n),this.name="HTMLInjectionError",this.html=t}},ye=He,$e=Z,ze=Symbol("nomatch"),Pt=7,Je=function(e){let n=Object.create(null),t=Object.create(null),i=[],l=!0,u="Could not find the language '{}', did you forget to load/include a language module?",r={disableAutodetect:!0,name:"Plain text",contains:[]},a={ignoreUnescapedHTML:!1,throwUnescapedHTML:!1,noHighlightRe:/^(no-?highlight)$/i,languageDetectRe:/\blang(?:uage)?-([\w-]+)\b/i,classPrefix:"hljs-",cssSelector:"pre code",languages:null,__emitter:Ae};function s(o){return a.noHighlightRe.test(o)}function d(o){let f=o.className+" ";f+=o.parentNode?o.parentNode.className:"";let g=a.languageDetectRe.exec(f);if(g){let _=L(g[1]);return _||(Pe(u.replace("{}",g[1])),Pe("Falling back to no-highlight mode for this block.",o)),_?g[1]:"no-highlight"}return f.split(/\s+/).find(_=>s(_)||L(_))}function b(o,f,g){let _="",S="";typeof f=="object"?(_=o,g=f.ignoreIllegals,S=f.language):(J("10.7.0","highlight(lang, code, ...args) has been deprecated."),J("10.7.0",`Please use highlight(code, options) instead.
https://github.com/highlightjs/highlight.js/issues/2277`),S=o,_=f),g===void 0&&(g=!0);let R={code:_,language:S};W("before:highlight",R);let D=R.result?R.result:N(R.language,R.code,g);return D.code=R.code,W("after:highlight",D),D}function N(o,f,g,_){let S=Object.create(null);function R(c,p){return c.keywords[p]}function D(){if(!m.keywords){C.addText(v);return}let c=0;m.keywordPatternRe.lastIndex=0;let p=m.keywordPatternRe.exec(v),E="";for(;p;){E+=v.substring(c,p.index);let T=G.case_insensitive?p[0].toLowerCase():p[0],B=R(m,T);if(B){let[K,$n]=B;if(C.addText(E),E="",S[T]=(S[T]||0)+1,S[T]<=Pt&&(ce+=$n),K.startsWith("_"))E+=p[0];else{let zn=G.classNameAliases[K]||K;H(p[0],zn)}}else E+=p[0];c=m.keywordPatternRe.lastIndex,p=m.keywordPatternRe.exec(v)}E+=v.substring(c),C.addText(E)}function F(){if(v==="")return;let c=null;if(typeof m.subLanguage=="string"){if(!n[m.subLanguage]){C.addText(v);return}c=N(m.subLanguage,v,!0,Ce[m.subLanguage]),Ce[m.subLanguage]=c._top}else c=y(v,m.subLanguage.length?m.subLanguage:null);m.relevance>0&&(ce+=c.relevance),C.__addSublanguage(c._emitter,c.language)}function z(){m.subLanguage!=null?F():D(),v=""}function H(c,p){c!==""&&(C.startScope(p),C.addText(c),C.endScope())}function xe(c,p){let E=1,T=p.length-1;for(;E<=T;){if(!c._emit[E]){E++;continue}let B=G.classNameAliases[c[E]]||c[E],K=p[E];B?H(K,B):(v=K,D(),v=""),E++}}function Me(c,p){return c.scope&&typeof c.scope=="string"&&C.openNode(G.classNameAliases[c.scope]||c.scope),c.beginScope&&(c.beginScope._wrap?(H(v,G.classNameAliases[c.beginScope._wrap]||c.beginScope._wrap),v=""):c.beginScope._multi&&(xe(c.beginScope,p),v="")),m=Object.create(c,{parent:{value:m}}),m}function ke(c,p,E){let T=nt(c.endRe,E);if(T){if(c["on:end"]){let B=new de(c);c["on:end"](p,B),B.isMatchIgnored&&(T=!1)}if(T){for(;c.endsParent&&c.parent;)c=c.parent;return c}}if(c.endsWithParent)return ke(c.parent,p,E)}function Ln(c){return m.matcher.regexIndex===0?(v+=c[0],1):(Ne=!0,0)}function Dn(c){let p=c[0],E=c.rule,T=new de(E),B=[E.__beforeBegin,E["on:begin"]];for(let K of B)if(K&&(K(c,T),T.isMatchIgnored))return Ln(p);return E.skip?v+=p:(E.excludeBegin&&(v+=p),z(),!E.returnBegin&&!E.excludeBegin&&(v=p)),Me(E,c),E.returnBegin?0:p.length}function Bn(c){let p=c[0],E=f.substring(c.index),T=ke(m,c,E);if(!T)return ze;let B=m;m.endScope&&m.endScope._wrap?(z(),H(p,m.endScope._wrap)):m.endScope&&m.endScope._multi?(z(),xe(m.endScope,c)):B.skip?v+=p:(B.returnEnd||B.excludeEnd||(v+=p),z(),B.excludeEnd&&(v=p));do m.scope&&C.closeNode(),!m.skip&&!m.subLanguage&&(ce+=m.relevance),m=m.parent;while(m!==T.parent);return T.starts&&Me(T.starts,c),B.returnEnd?0:p.length}function Un(){let c=[];for(let p=m;p!==G;p=p.parent)p.scope&&c.unshift(p.scope);c.forEach(p=>C.openNode(p))}let oe={};function Ie(c,p){let E=p&&p[0];if(v+=c,E==null)return z(),0;if(oe.type==="begin"&&p.type==="end"&&oe.index===p.index&&E===""){if(v+=f.slice(p.index,p.index+1),!l){let T=new Error(`0 width match regex (${o})`);throw T.languageName=o,T.badRule=oe.rule,T}return 1}if(oe=p,p.type==="begin")return Dn(p);if(p.type==="illegal"&&!g){let T=new Error('Illegal lexeme "'+E+'" for mode "'+(m.scope||"<unnamed>")+'"');throw T.mode=m,T}else if(p.type==="end"){let T=Bn(p);if(T!==ze)return T}if(p.type==="illegal"&&E==="")return v+=`
`,1;if(he>1e5&&he>p.index*3)throw new Error("potential infinite loop, way more iterations than matches");return v+=E,E.length}let G=L(o);if(!G)throw X(u.replace("{}",o)),new Error('Unknown language: "'+o+'"');let Pn=Dt(G),Ee="",m=_||Pn,Ce={},C=new a.__emitter(a);Un();let v="",ce=0,q=0,he=0,Ne=!1;try{if(G.__emitTokens)G.__emitTokens(f,C);else{for(m.matcher.considerAll();;){he++,Ne?Ne=!1:m.matcher.considerAll(),m.matcher.lastIndex=q;let c=m.matcher.exec(f);if(!c)break;let p=f.substring(q,c.index),E=Ie(p,c);q=c.index+E}Ie(f.substring(q))}return C.finalize(),Ee=C.toHTML(),{language:o,value:Ee,relevance:ce,illegal:!1,_emitter:C,_top:m}}catch(c){if(c.message&&c.message.includes("Illegal"))return{language:o,value:ye(f),illegal:!0,relevance:0,_illegalBy:{message:c.message,index:q,context:f.slice(q-100,q+100),mode:c.mode,resultSoFar:Ee},_emitter:C};if(l)return{language:o,value:ye(f),illegal:!1,relevance:0,errorRaised:c,_emitter:C,_top:m};throw c}}function h(o){let f={value:ye(o),illegal:!1,relevance:0,_top:r,_emitter:new a.__emitter(a)};return f._emitter.addText(o),f}function y(o,f){f=f||a.languages||Object.keys(n);let g=h(o),_=f.filter(L).filter(V).map(z=>N(z,o,!1));_.unshift(g);let S=_.sort((z,H)=>{if(z.relevance!==H.relevance)return H.relevance-z.relevance;if(z.language&&H.language){if(L(z.language).supersetOf===H.language)return 1;if(L(H.language).supersetOf===z.language)return-1}return 0}),[R,D]=S,F=R;return F.secondBest=D,F}function O(o,f,g){let _=f&&t[f]||g;o.classList.add("hljs"),o.classList.add(`language-${_}`)}function A(o){let f=null,g=d(o);if(s(g))return;if(W("before:highlightElement",{el:o,language:g}),o.dataset.highlighted){console.log("Element previously highlighted. To highlight again, first unset `dataset.highlighted`.",o);return}if(o.children.length>0&&(a.ignoreUnescapedHTML||(console.warn("One of your code blocks includes unescaped HTML. This is a potentially serious security risk."),console.warn("https://github.com/highlightjs/highlight.js/wiki/security"),console.warn("The element with unescaped HTML:"),console.warn(o)),a.throwUnescapedHTML))throw new ve("One of your code blocks includes unescaped HTML.",o.innerHTML);f=o;let _=f.textContent,S=g?b(_,{language:g,ignoreIllegals:!0}):y(_);o.innerHTML=S.value,o.dataset.highlighted="yes",O(o,g,S.language),o.result={language:S.language,re:S.relevance,relevance:S.relevance},S.secondBest&&(o.secondBest={language:S.secondBest.language,relevance:S.secondBest.relevance}),W("after:highlightElement",{el:o,result:S,text:_})}function w(o){a=$e(a,o)}let x=()=>{P(),J("10.6.0","initHighlighting() deprecated.  Use highlightAll() now.")};function I(){P(),J("10.6.0","initHighlightingOnLoad() deprecated.  Use highlightAll() now.")}let U=!1;function P(){function o(){P()}if(document.readyState==="loading"){U||window.addEventListener("DOMContentLoaded",o,!1),U=!0;return}document.querySelectorAll(a.cssSelector).forEach(A)}function M(o,f){let g=null;try{g=f(e)}catch(_){if(X("Language definition for '{}' could not be registered.".replace("{}",o)),l)X(_);else throw _;g=r}g.name||(g.name=o),n[o]=g,g.rawDefinition=f.bind(null,e),g.aliases&&$(g.aliases,{languageName:o})}function k(o){delete n[o];for(let f of Object.keys(t))t[f]===o&&delete t[f]}function Y(){return Object.keys(n)}function L(o){return o=(o||"").toLowerCase(),n[o]||n[t[o]]}function $(o,{languageName:f}){typeof o=="string"&&(o=[o]),o.forEach(g=>{t[g.toLowerCase()]=f})}function V(o){let f=L(o);return f&&!f.disableAutodetect}function ne(o){o["before:highlightBlock"]&&!o["before:highlightElement"]&&(o["before:highlightElement"]=f=>{o["before:highlightBlock"](Object.assign({block:f.el},f))}),o["after:highlightBlock"]&&!o["after:highlightElement"]&&(o["after:highlightElement"]=f=>{o["after:highlightBlock"](Object.assign({block:f.el},f))})}function te(o){ne(o),i.push(o)}function ie(o){let f=i.indexOf(o);f!==-1&&i.splice(f,1)}function W(o,f){let g=o;i.forEach(function(_){_[g]&&_[g](f)})}function ae(o){return J("10.7.0","highlightBlock will be removed entirely in v12.0"),J("10.7.0","Please use highlightElement now."),A(o)}Object.assign(e,{highlight:b,highlightAuto:y,highlightAll:P,highlightElement:A,highlightBlock:ae,configure:w,initHighlighting:x,initHighlightingOnLoad:I,registerLanguage:M,unregisterLanguage:k,listLanguages:Y,getLanguage:L,registerAliases:$,autoDetection:V,inherit:$e,addPlugin:te,removePlugin:ie}),e.debugMode=function(){l=!1},e.safeMode=function(){l=!0},e.versionString=Ut,e.regex={concat:Q,lookahead:Ge,either:Oe,optional:jn,anyNumberOfTimes:Jn};for(let o in ue)typeof ue[o]=="object"&&Fe(ue[o]);return Object.assign(e,ue),e},j=Je({});j.newInstance=()=>Je({});je.exports=j;j.HighlightJS=j;j.default=j});var ei={};Yn(ei,{highlightRows:()=>jt,languageForPath:()=>In,tokenize:()=>Cn});var nn=qn(en(),1);var fe=nn.default;var tn="[A-Za-z$_][0-9A-Za-z$_]*",$t=["as","in","of","if","for","while","finally","var","new","function","do","return","void","else","break","catch","instanceof","with","throw","case","default","try","switch","continue","typeof","delete","let","yield","const","class","debugger","async","await","static","import","from","export","extends","using"],zt=["true","false","null","undefined","NaN","Infinity"],an=["Object","Function","Boolean","Symbol","Math","Date","Number","BigInt","String","RegExp","Array","Float32Array","Float64Array","Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Int32Array","Uint16Array","Uint32Array","BigInt64Array","BigUint64Array","Set","Map","WeakSet","WeakMap","ArrayBuffer","SharedArrayBuffer","Atomics","DataView","JSON","Promise","Generator","GeneratorFunction","AsyncFunction","Reflect","Proxy","Intl","WebAssembly"],rn=["Error","EvalError","InternalError","RangeError","ReferenceError","SyntaxError","TypeError","URIError"],sn=["setInterval","setTimeout","clearInterval","clearTimeout","require","exports","eval","isFinite","isNaN","parseFloat","parseInt","decodeURI","decodeURIComponent","encodeURI","encodeURIComponent","escape","unescape"],Ft=["arguments","this","super","console","window","document","localStorage","sessionStorage","module","global"],Ht=[].concat(sn,an,rn);function on(e){let n=e.regex,t=(g,{after:_})=>{let S="</"+g[0].slice(1);return g.input.indexOf(S,_)!==-1},i=tn,l={begin:"<>",end:"</>"},u=/<[A-Za-z0-9\\._:-]+\s*\/>/,r={begin:/<[A-Za-z0-9\\._:-]+/,end:/\/[A-Za-z0-9\\._:-]+>|\/>/,isTrulyOpeningTag:(g,_)=>{let S=g[0].length+g.index,R=g.input[S];if(R==="<"||R===","){_.ignoreMatch();return}R===">"&&(t(g,{after:S})||_.ignoreMatch());let D,F=g.input.substring(S);if(D=F.match(/^\s*=/)){_.ignoreMatch();return}if((D=F.match(/^\s+extends\s+/))&&D.index===0){_.ignoreMatch();return}}},a={$pattern:tn,keyword:$t,literal:zt,built_in:Ht,"variable.language":Ft},s="[0-9](_?[0-9])*",d=`\\.(${s})`,b="0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*",N={className:"number",variants:[{begin:`(\\b(${b})((${d})|\\.)?|(${d}))[eE][+-]?(${s})\\b`},{begin:`\\b(${b})\\b((${d})\\b|\\.)?|(${d})\\b`},{begin:"\\b(0|[1-9](_?[0-9])*)n\\b"},{begin:"\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b"},{begin:"\\b0[bB][0-1](_?[0-1])*n?\\b"},{begin:"\\b0[oO][0-7](_?[0-7])*n?\\b"},{begin:"\\b0[0-7]+n?\\b"}],relevance:0},h={className:"subst",begin:"\\$\\{",end:"\\}",keywords:a,contains:[]},y={begin:".?html`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,h],subLanguage:"xml"}},O={begin:".?css`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,h],subLanguage:"css"}},A={begin:".?gql`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,h],subLanguage:"graphql"}},w={className:"string",begin:"`",end:"`",contains:[e.BACKSLASH_ESCAPE,h]},I={className:"comment",variants:[e.COMMENT(/\/\*\*(?!\/)/,"\\*/",{relevance:0,contains:[{begin:"(?=@[A-Za-z]+)",relevance:0,contains:[{className:"doctag",begin:"@[A-Za-z]+"},{className:"type",begin:"\\{",end:"\\}",excludeEnd:!0,excludeBegin:!0,relevance:0},{className:"variable",begin:i+"(?=\\s*(-)|$)",endsParent:!0,relevance:0},{begin:/(?=[^\n])\s/,relevance:0}]}]}),e.C_BLOCK_COMMENT_MODE,e.C_LINE_COMMENT_MODE]},U=[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,y,O,A,w,{match:/\$\d+/},N];h.contains=U.concat({begin:/\{/,end:/\}/,keywords:a,contains:["self"].concat(U)});let P=[].concat(I,h.contains),M=P.concat([{begin:/(\s*)\(/,end:/\)/,keywords:a,contains:["self"].concat(P)}]),k={className:"params",begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:a,contains:M},Y={variants:[{match:[/class/,/\s+/,i,/\s+/,/extends/,/\s+/,n.concat(i,"(",n.concat(/\./,i),")*")],scope:{1:"keyword",3:"title.class",5:"keyword",7:"title.class.inherited"}},{match:[/class/,/\s+/,i],scope:{1:"keyword",3:"title.class"}}]},L={relevance:0,match:n.either(/\bJSON/,/\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,/\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,/\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/),className:"title.class",keywords:{_:[...an,...rn]}},$={label:"use_strict",className:"meta",relevance:10,begin:/^\s*['"]use (strict|asm)['"]/},V={variants:[{match:[/function/,/\s+/,i,/(?=\s*\()/]},{match:[/function/,/\s*(?=\()/]}],className:{1:"keyword",3:"title.function"},label:"func.def",contains:[k],illegal:/%/},ne={relevance:0,match:/\b[A-Z][A-Z_0-9]+\b/,className:"variable.constant"};function te(g){return n.concat("(?!",g.join("|"),")")}let ie={match:n.concat(/\b/,te([...sn,"super","import"].map(g=>`${g}\\s*\\(`)),i,n.lookahead(/\s*\(/)),className:"title.function",relevance:0},W={begin:n.concat(/\./,n.lookahead(n.concat(i,/(?![0-9A-Za-z$_(])/))),end:i,excludeBegin:!0,keywords:"prototype",className:"property",relevance:0},ae={match:[/get|set/,/\s+/,i,/(?=\()/],className:{1:"keyword",3:"title.function"},contains:[{begin:/\(\)/},k]},o="(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|"+e.UNDERSCORE_IDENT_RE+")\\s*=>",f={match:[/const|var|let/,/\s+/,i,/\s*/,/=\s*/,/(async\s*)?/,n.lookahead(o)],keywords:"async",className:{1:"keyword",3:"title.function"},contains:[k]};return{name:"JavaScript",aliases:["js","jsx","mjs","cjs"],keywords:a,exports:{PARAMS_CONTAINS:M,CLASS_REFERENCE:L},illegal:/#(?![$_A-z])/,contains:[e.SHEBANG({label:"shebang",binary:"node",relevance:5}),$,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,y,O,A,w,I,{match:/\$\d+/},N,L,{scope:"attr",match:i+n.lookahead(":"),relevance:0},f,{begin:"("+e.RE_STARTERS_RE+"|\\b(case|return|throw)\\b)\\s*",keywords:"return throw case",relevance:0,contains:[I,e.REGEXP_MODE,{className:"function",begin:o,returnBegin:!0,end:"\\s*=>",contains:[{className:"params",variants:[{begin:e.UNDERSCORE_IDENT_RE,relevance:0},{className:null,begin:/\(\s*\)/,skip:!0},{begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:a,contains:M}]}]},{begin:/,/,relevance:0},{match:/\s+/,relevance:0},{variants:[{begin:l.begin,end:l.end},{match:u},{begin:r.begin,"on:begin":r.isTrulyOpeningTag,end:r.end}],subLanguage:"xml",contains:[{begin:r.begin,end:r.end,skip:!0,contains:["self"]}]}]},V,{beginKeywords:"while if switch catch for"},{begin:"\\b(?!function)"+e.UNDERSCORE_IDENT_RE+"\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",returnBegin:!0,label:"func.def",contains:[k,e.inherit(e.TITLE_MODE,{begin:i,className:"title.function"})]},{match:/\.\.\./,relevance:0},W,{match:"\\$"+i,relevance:0},{match:[/\bconstructor(?=\s*\()/],className:{1:"title.function"},contains:[k]},ie,ne,Y,ae,{match:/\$[(.]/}]}}var pe="[A-Za-z$_][0-9A-Za-z$_]*",cn=["as","in","of","if","for","while","finally","var","new","function","do","return","void","else","break","catch","instanceof","with","throw","case","default","try","switch","continue","typeof","delete","let","yield","const","class","debugger","async","await","static","import","from","export","extends","using"],ln=["true","false","null","undefined","NaN","Infinity"],un=["Object","Function","Boolean","Symbol","Math","Date","Number","BigInt","String","RegExp","Array","Float32Array","Float64Array","Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Int32Array","Uint16Array","Uint32Array","BigInt64Array","BigUint64Array","Set","Map","WeakSet","WeakMap","ArrayBuffer","SharedArrayBuffer","Atomics","DataView","JSON","Promise","Generator","GeneratorFunction","AsyncFunction","Reflect","Proxy","Intl","WebAssembly"],dn=["Error","EvalError","InternalError","RangeError","ReferenceError","SyntaxError","TypeError","URIError"],gn=["setInterval","setTimeout","clearInterval","clearTimeout","require","exports","eval","isFinite","isNaN","parseFloat","parseInt","decodeURI","decodeURIComponent","encodeURI","encodeURIComponent","escape","unescape"],bn=["arguments","this","super","console","window","document","localStorage","sessionStorage","module","global"],fn=[].concat(gn,un,dn);function Gt(e){let n=e.regex,t=(g,{after:_})=>{let S="</"+g[0].slice(1);return g.input.indexOf(S,_)!==-1},i=pe,l={begin:"<>",end:"</>"},u=/<[A-Za-z0-9\\._:-]+\s*\/>/,r={begin:/<[A-Za-z0-9\\._:-]+/,end:/\/[A-Za-z0-9\\._:-]+>|\/>/,isTrulyOpeningTag:(g,_)=>{let S=g[0].length+g.index,R=g.input[S];if(R==="<"||R===","){_.ignoreMatch();return}R===">"&&(t(g,{after:S})||_.ignoreMatch());let D,F=g.input.substring(S);if(D=F.match(/^\s*=/)){_.ignoreMatch();return}if((D=F.match(/^\s+extends\s+/))&&D.index===0){_.ignoreMatch();return}}},a={$pattern:pe,keyword:cn,literal:ln,built_in:fn,"variable.language":bn},s="[0-9](_?[0-9])*",d=`\\.(${s})`,b="0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*",N={className:"number",variants:[{begin:`(\\b(${b})((${d})|\\.)?|(${d}))[eE][+-]?(${s})\\b`},{begin:`\\b(${b})\\b((${d})\\b|\\.)?|(${d})\\b`},{begin:"\\b(0|[1-9](_?[0-9])*)n\\b"},{begin:"\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b"},{begin:"\\b0[bB][0-1](_?[0-1])*n?\\b"},{begin:"\\b0[oO][0-7](_?[0-7])*n?\\b"},{begin:"\\b0[0-7]+n?\\b"}],relevance:0},h={className:"subst",begin:"\\$\\{",end:"\\}",keywords:a,contains:[]},y={begin:".?html`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,h],subLanguage:"xml"}},O={begin:".?css`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,h],subLanguage:"css"}},A={begin:".?gql`",end:"",starts:{end:"`",returnEnd:!1,contains:[e.BACKSLASH_ESCAPE,h],subLanguage:"graphql"}},w={className:"string",begin:"`",end:"`",contains:[e.BACKSLASH_ESCAPE,h]},I={className:"comment",variants:[e.COMMENT(/\/\*\*(?!\/)/,"\\*/",{relevance:0,contains:[{begin:"(?=@[A-Za-z]+)",relevance:0,contains:[{className:"doctag",begin:"@[A-Za-z]+"},{className:"type",begin:"\\{",end:"\\}",excludeEnd:!0,excludeBegin:!0,relevance:0},{className:"variable",begin:i+"(?=\\s*(-)|$)",endsParent:!0,relevance:0},{begin:/(?=[^\n])\s/,relevance:0}]}]}),e.C_BLOCK_COMMENT_MODE,e.C_LINE_COMMENT_MODE]},U=[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,y,O,A,w,{match:/\$\d+/},N];h.contains=U.concat({begin:/\{/,end:/\}/,keywords:a,contains:["self"].concat(U)});let P=[].concat(I,h.contains),M=P.concat([{begin:/(\s*)\(/,end:/\)/,keywords:a,contains:["self"].concat(P)}]),k={className:"params",begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:a,contains:M},Y={variants:[{match:[/class/,/\s+/,i,/\s+/,/extends/,/\s+/,n.concat(i,"(",n.concat(/\./,i),")*")],scope:{1:"keyword",3:"title.class",5:"keyword",7:"title.class.inherited"}},{match:[/class/,/\s+/,i],scope:{1:"keyword",3:"title.class"}}]},L={relevance:0,match:n.either(/\bJSON/,/\b[A-Z][a-z]+([A-Z][a-z]*|\d)*/,/\b[A-Z]{2,}([A-Z][a-z]+|\d)+([A-Z][a-z]*)*/,/\b[A-Z]{2,}[a-z]+([A-Z][a-z]+|\d)*([A-Z][a-z]*)*/),className:"title.class",keywords:{_:[...un,...dn]}},$={label:"use_strict",className:"meta",relevance:10,begin:/^\s*['"]use (strict|asm)['"]/},V={variants:[{match:[/function/,/\s+/,i,/(?=\s*\()/]},{match:[/function/,/\s*(?=\()/]}],className:{1:"keyword",3:"title.function"},label:"func.def",contains:[k],illegal:/%/},ne={relevance:0,match:/\b[A-Z][A-Z_0-9]+\b/,className:"variable.constant"};function te(g){return n.concat("(?!",g.join("|"),")")}let ie={match:n.concat(/\b/,te([...gn,"super","import"].map(g=>`${g}\\s*\\(`)),i,n.lookahead(/\s*\(/)),className:"title.function",relevance:0},W={begin:n.concat(/\./,n.lookahead(n.concat(i,/(?![0-9A-Za-z$_(])/))),end:i,excludeBegin:!0,keywords:"prototype",className:"property",relevance:0},ae={match:[/get|set/,/\s+/,i,/(?=\()/],className:{1:"keyword",3:"title.function"},contains:[{begin:/\(\)/},k]},o="(\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)|"+e.UNDERSCORE_IDENT_RE+")\\s*=>",f={match:[/const|var|let/,/\s+/,i,/\s*/,/=\s*/,/(async\s*)?/,n.lookahead(o)],keywords:"async",className:{1:"keyword",3:"title.function"},contains:[k]};return{name:"JavaScript",aliases:["js","jsx","mjs","cjs"],keywords:a,exports:{PARAMS_CONTAINS:M,CLASS_REFERENCE:L},illegal:/#(?![$_A-z])/,contains:[e.SHEBANG({label:"shebang",binary:"node",relevance:5}),$,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,y,O,A,w,I,{match:/\$\d+/},N,L,{scope:"attr",match:i+n.lookahead(":"),relevance:0},f,{begin:"("+e.RE_STARTERS_RE+"|\\b(case|return|throw)\\b)\\s*",keywords:"return throw case",relevance:0,contains:[I,e.REGEXP_MODE,{className:"function",begin:o,returnBegin:!0,end:"\\s*=>",contains:[{className:"params",variants:[{begin:e.UNDERSCORE_IDENT_RE,relevance:0},{className:null,begin:/\(\s*\)/,skip:!0},{begin:/(\s*)\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:a,contains:M}]}]},{begin:/,/,relevance:0},{match:/\s+/,relevance:0},{variants:[{begin:l.begin,end:l.end},{match:u},{begin:r.begin,"on:begin":r.isTrulyOpeningTag,end:r.end}],subLanguage:"xml",contains:[{begin:r.begin,end:r.end,skip:!0,contains:["self"]}]}]},V,{beginKeywords:"while if switch catch for"},{begin:"\\b(?!function)"+e.UNDERSCORE_IDENT_RE+"\\([^()]*(\\([^()]*(\\([^()]*\\)[^()]*)*\\)[^()]*)*\\)\\s*\\{",returnBegin:!0,label:"func.def",contains:[k,e.inherit(e.TITLE_MODE,{begin:i,className:"title.function"})]},{match:/\.\.\./,relevance:0},W,{match:"\\$"+i,relevance:0},{match:[/\bconstructor(?=\s*\()/],className:{1:"title.function"},contains:[k]},ie,ne,Y,ae,{match:/\$[(.]/}]}}function pn(e){let n=e.regex,t=Gt(e),i=pe,l=["any","void","number","boolean","string","object","never","symbol","bigint","unknown"],u={begin:[/namespace/,/\s+/,e.IDENT_RE],beginScope:{1:"keyword",3:"title.class"}},r={beginKeywords:"interface",end:/\{/,excludeEnd:!0,keywords:{keyword:"interface extends",built_in:l},contains:[t.exports.CLASS_REFERENCE]},a={className:"meta",relevance:10,begin:/^\s*['"]use strict['"]/},s=["type","interface","public","private","protected","implements","declare","abstract","readonly","enum","override","satisfies"],d={$pattern:pe,keyword:cn.concat(s),literal:ln,built_in:fn.concat(l),"variable.language":bn},b={className:"meta",begin:"@"+i},N=(A,w,x)=>{let I=A.contains.findIndex(U=>U.label===w);if(I===-1)throw new Error("can not find mode to replace");A.contains.splice(I,1,x)};Object.assign(t.keywords,d),t.exports.PARAMS_CONTAINS.push(b);let h=t.contains.find(A=>A.scope==="attr"),y=Object.assign({},h,{match:n.concat(i,n.lookahead(/\s*\?:/))});t.exports.PARAMS_CONTAINS.push([t.exports.CLASS_REFERENCE,h,y]),t.contains=t.contains.concat([b,u,r,y]),N(t,"shebang",e.SHEBANG()),N(t,"use_strict",a);let O=t.contains.find(A=>A.label==="func.def");return O.relevance=0,Object.assign(t,{name:"TypeScript",aliases:["ts","tsx","mts","cts"]}),t}function mn(e){let n=e.regex,t=/[\p{XID_Start}_]\p{XID_Continue}*/u,i=["and","as","assert","async","await","break","case","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","match","nonlocal|10","not","or","pass","raise","return","try","while","with","yield"],a={$pattern:/[A-Za-z]\w+|__\w+__/,keyword:i,built_in:["__import__","abs","all","any","ascii","bin","bool","breakpoint","bytearray","bytes","callable","chr","classmethod","compile","complex","delattr","dict","dir","divmod","enumerate","eval","exec","filter","float","format","frozenset","getattr","globals","hasattr","hash","help","hex","id","input","int","isinstance","issubclass","iter","len","list","locals","map","max","memoryview","min","next","object","oct","open","ord","pow","print","property","range","repr","reversed","round","set","setattr","slice","sorted","staticmethod","str","sum","super","tuple","type","vars","zip"],literal:["__debug__","Ellipsis","False","None","NotImplemented","True"],type:["Any","Callable","Coroutine","Dict","List","Literal","Generic","Optional","Sequence","Set","Tuple","Type","Union"]},s={className:"meta",begin:/^(>>>|\.\.\.) /},d={className:"subst",begin:/\{/,end:/\}/,keywords:a,illegal:/#/},b={begin:/\{\{/,relevance:0},N={className:"string",contains:[e.BACKSLASH_ESCAPE],variants:[{begin:/([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?'''/,end:/'''/,contains:[e.BACKSLASH_ESCAPE,s],relevance:10},{begin:/([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?"""/,end:/"""/,contains:[e.BACKSLASH_ESCAPE,s],relevance:10},{begin:/([fF][rR]|[rR][fF]|[fF])'''/,end:/'''/,contains:[e.BACKSLASH_ESCAPE,s,b,d]},{begin:/([fF][rR]|[rR][fF]|[fF])"""/,end:/"""/,contains:[e.BACKSLASH_ESCAPE,s,b,d]},{begin:/([uU]|[rR])'/,end:/'/,relevance:10},{begin:/([uU]|[rR])"/,end:/"/,relevance:10},{begin:/([bB]|[bB][rR]|[rR][bB])'/,end:/'/},{begin:/([bB]|[bB][rR]|[rR][bB])"/,end:/"/},{begin:/([fF][rR]|[rR][fF]|[fF])'/,end:/'/,contains:[e.BACKSLASH_ESCAPE,b,d]},{begin:/([fF][rR]|[rR][fF]|[fF])"/,end:/"/,contains:[e.BACKSLASH_ESCAPE,b,d]},e.APOS_STRING_MODE,e.QUOTE_STRING_MODE]},h="[0-9](_?[0-9])*",y=`(\\b(${h}))?\\.(${h})|\\b(${h})\\.`,O=`\\b|${i.join("|")}`,A={className:"number",relevance:0,variants:[{begin:`(\\b(${h})|(${y}))[eE][+-]?(${h})[jJ]?(?=${O})`},{begin:`(${y})[jJ]?`},{begin:`\\b([1-9](_?[0-9])*|0+(_?0)*)[lLjJ]?(?=${O})`},{begin:`\\b0[bB](_?[01])+[lL]?(?=${O})`},{begin:`\\b0[oO](_?[0-7])+[lL]?(?=${O})`},{begin:`\\b0[xX](_?[0-9a-fA-F])+[lL]?(?=${O})`},{begin:`\\b(${h})[jJ](?=${O})`}]},w={className:"comment",begin:n.lookahead(/# type:/),end:/$/,keywords:a,contains:[{begin:/# type:/},{begin:/#/,end:/\b\B/,endsWithParent:!0}]},x={className:"params",variants:[{className:"",begin:/\(\s*\)/,skip:!0},{begin:/\(/,end:/\)/,excludeBegin:!0,excludeEnd:!0,keywords:a,contains:["self",s,A,N,e.HASH_COMMENT_MODE]}]};return d.contains=[N,A,s],{name:"Python",aliases:["py","gyp","ipython"],unicodeRegex:!0,keywords:a,illegal:/(<\/|\?)|=>/,contains:[s,A,{scope:"variable.language",match:/\bself\b/},{beginKeywords:"if",relevance:0},{match:/\bor\b/,scope:"keyword"},N,w,e.HASH_COMMENT_MODE,{match:[/\bdef/,/\s+/,t],scope:{1:"keyword",3:"title.function"},contains:[x]},{variants:[{match:[/\bclass/,/\s+/,t,/\s*/,/\(\s*/,t,/\s*\)/]},{match:[/\bclass/,/\s+/,t]}],scope:{1:"keyword",3:"title.class",6:"title.class.inherited"}},{className:"meta",begin:/^[\t ]*@/,end:/(?=#)|$/,contains:[A,x,N]}]}}function _n(e){let n={className:"attr",begin:/"(\\.|[^\\"\r\n])*"(?=\s*:)/,relevance:1.01},t={match:/[{}[\],:]/,className:"punctuation",relevance:0},i=["true","false","null"],l={scope:"literal",beginKeywords:i.join(" ")};return{name:"JSON",aliases:["jsonc"],keywords:{literal:i},contains:[n,t,e.QUOTE_STRING_MODE,l,e.C_NUMBER_MODE,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE],illegal:"\\S"}}function En(e){let n="true false yes no null",t="[\\w#;/?:@&=+$,.~*'()[\\]]+",i={className:"attr",variants:[{begin:/[\w*@][\w*@ :()\./-]*:(?=[ \t]|$)/},{begin:/"[\w*@][\w*@ :()\./-]*":(?=[ \t]|$)/},{begin:/'[\w*@][\w*@ :()\./-]*':(?=[ \t]|$)/}]},l={className:"template-variable",variants:[{begin:/\{\{/,end:/\}\}/},{begin:/%\{/,end:/\}/}]},u={className:"string",relevance:0,begin:/'/,end:/'/,contains:[{match:/''/,scope:"char.escape",relevance:0}]},r={className:"string",relevance:0,variants:[{begin:/"/,end:/"/},{begin:/\S+/}],contains:[e.BACKSLASH_ESCAPE,l]},a=e.inherit(r,{variants:[{begin:/'/,end:/'/,contains:[{begin:/''/,relevance:0}]},{begin:/"/,end:/"/},{begin:/[^\s,{}[\]]+/}]}),h={className:"number",begin:"\\b"+"[0-9]{4}(-[0-9][0-9]){0,2}"+"([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?"+"(\\.[0-9]*)?"+"([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?"+"\\b"},y={end:",",endsWithParent:!0,excludeEnd:!0,keywords:n,relevance:0},O={begin:/\{/,end:/\}/,contains:[y],illegal:"\\n",relevance:0},A={begin:"\\[",end:"\\]",contains:[y],illegal:"\\n",relevance:0},w=[i,{className:"meta",begin:"^---\\s*$",relevance:10},{className:"string",begin:"[\\|>]([1-9]?[+-])?[ ]*\\n( +)[^ ][^\\n]*\\n(\\2[^\\n]+\\n?)*"},{begin:"<%[%=-]?",end:"[%-]?%>",subLanguage:"ruby",excludeBegin:!0,excludeEnd:!0,relevance:0},{className:"type",begin:"!\\w+!"+t},{className:"type",begin:"!<"+t+">"},{className:"type",begin:"!"+t},{className:"type",begin:"!!"+t},{className:"meta",begin:"&"+e.UNDERSCORE_IDENT_RE+"$"},{className:"meta",begin:"\\*"+e.UNDERSCORE_IDENT_RE+"$"},{className:"bullet",begin:"-(?=[ ]|$)",relevance:0},e.HASH_COMMENT_MODE,{beginKeywords:n,keywords:{literal:n}},h,{className:"number",begin:e.C_NUMBER_RE+"\\b",relevance:0},O,A,u,r],x=[...w];return x.pop(),x.push(a),y.contains=x,{name:"YAML",case_insensitive:!0,aliases:["yml"],contains:w}}var Kt=e=>({IMPORTANT:{scope:"meta",begin:"!important"},BLOCK_COMMENT:e.C_BLOCK_COMMENT_MODE,HEXCOLOR:{scope:"number",begin:/#(([0-9a-fA-F]{3,4})|(([0-9a-fA-F]{2}){3,4}))\b/},FUNCTION_DISPATCH:{className:"built_in",begin:/[\w-]+(?=\()/},ATTRIBUTE_SELECTOR_MODE:{scope:"selector-attr",begin:/\[/,end:/\]/,illegal:"$",contains:[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE]},CSS_NUMBER_MODE:{scope:"number",begin:e.NUMBER_RE+"(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",relevance:0},CSS_VARIABLE:{className:"attr",begin:/--[A-Za-z_][A-Za-z0-9_-]*/}}),Wt=["a","abbr","address","article","aside","audio","b","blockquote","body","button","canvas","caption","cite","code","dd","del","details","dfn","div","dl","dt","em","fieldset","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","hgroup","html","i","iframe","img","input","ins","kbd","label","legend","li","main","mark","menu","nav","object","ol","optgroup","option","p","picture","q","quote","samp","section","select","source","span","strong","summary","sup","table","tbody","td","textarea","tfoot","th","thead","time","tr","ul","var","video"],Zt=["defs","g","marker","mask","pattern","svg","switch","symbol","feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feFlood","feGaussianBlur","feImage","feMerge","feMorphology","feOffset","feSpecularLighting","feTile","feTurbulence","linearGradient","radialGradient","stop","circle","ellipse","image","line","path","polygon","polyline","rect","text","use","textPath","tspan","foreignObject","clipPath"],Yt=[...Wt,...Zt],qt=["any-hover","any-pointer","aspect-ratio","color","color-gamut","color-index","device-aspect-ratio","device-height","device-width","display-mode","forced-colors","grid","height","hover","inverted-colors","monochrome","orientation","overflow-block","overflow-inline","pointer","prefers-color-scheme","prefers-contrast","prefers-reduced-motion","prefers-reduced-transparency","resolution","scan","scripting","update","width","min-width","max-width","min-height","max-height"].sort().reverse(),Xt=["active","any-link","blank","checked","current","default","defined","dir","disabled","drop","empty","enabled","first","first-child","first-of-type","fullscreen","future","focus","focus-visible","focus-within","has","host","host-context","hover","indeterminate","in-range","invalid","is","lang","last-child","last-of-type","left","link","local-link","not","nth-child","nth-col","nth-last-child","nth-last-col","nth-last-of-type","nth-of-type","only-child","only-of-type","optional","out-of-range","past","placeholder-shown","read-only","read-write","required","right","root","scope","target","target-within","user-invalid","valid","visited","where"].sort().reverse(),Qt=["after","backdrop","before","cue","cue-region","first-letter","first-line","grammar-error","marker","part","placeholder","selection","slotted","spelling-error"].sort().reverse(),Vt=["accent-color","align-content","align-items","align-self","alignment-baseline","all","anchor-name","animation","animation-composition","animation-delay","animation-direction","animation-duration","animation-fill-mode","animation-iteration-count","animation-name","animation-play-state","animation-range","animation-range-end","animation-range-start","animation-timeline","animation-timing-function","appearance","aspect-ratio","backdrop-filter","backface-visibility","background","background-attachment","background-blend-mode","background-clip","background-color","background-image","background-origin","background-position","background-position-x","background-position-y","background-repeat","background-size","baseline-shift","block-size","border","border-block","border-block-color","border-block-end","border-block-end-color","border-block-end-style","border-block-end-width","border-block-start","border-block-start-color","border-block-start-style","border-block-start-width","border-block-style","border-block-width","border-bottom","border-bottom-color","border-bottom-left-radius","border-bottom-right-radius","border-bottom-style","border-bottom-width","border-collapse","border-color","border-end-end-radius","border-end-start-radius","border-image","border-image-outset","border-image-repeat","border-image-slice","border-image-source","border-image-width","border-inline","border-inline-color","border-inline-end","border-inline-end-color","border-inline-end-style","border-inline-end-width","border-inline-start","border-inline-start-color","border-inline-start-style","border-inline-start-width","border-inline-style","border-inline-width","border-left","border-left-color","border-left-style","border-left-width","border-radius","border-right","border-right-color","border-right-style","border-right-width","border-spacing","border-start-end-radius","border-start-start-radius","border-style","border-top","border-top-color","border-top-left-radius","border-top-right-radius","border-top-style","border-top-width","border-width","bottom","box-align","box-decoration-break","box-direction","box-flex","box-flex-group","box-lines","box-ordinal-group","box-orient","box-pack","box-shadow","box-sizing","break-after","break-before","break-inside","caption-side","caret-color","clear","clip","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","color-scheme","column-count","column-fill","column-gap","column-rule","column-rule-color","column-rule-style","column-rule-width","column-span","column-width","columns","contain","contain-intrinsic-block-size","contain-intrinsic-height","contain-intrinsic-inline-size","contain-intrinsic-size","contain-intrinsic-width","container","container-name","container-type","content","content-visibility","counter-increment","counter-reset","counter-set","cue","cue-after","cue-before","cursor","cx","cy","direction","display","dominant-baseline","empty-cells","enable-background","field-sizing","fill","fill-opacity","fill-rule","filter","flex","flex-basis","flex-direction","flex-flow","flex-grow","flex-shrink","flex-wrap","float","flood-color","flood-opacity","flow","font","font-display","font-family","font-feature-settings","font-kerning","font-language-override","font-optical-sizing","font-palette","font-size","font-size-adjust","font-smooth","font-smoothing","font-stretch","font-style","font-synthesis","font-synthesis-position","font-synthesis-small-caps","font-synthesis-style","font-synthesis-weight","font-variant","font-variant-alternates","font-variant-caps","font-variant-east-asian","font-variant-emoji","font-variant-ligatures","font-variant-numeric","font-variant-position","font-variation-settings","font-weight","forced-color-adjust","gap","glyph-orientation-horizontal","glyph-orientation-vertical","grid","grid-area","grid-auto-columns","grid-auto-flow","grid-auto-rows","grid-column","grid-column-end","grid-column-start","grid-gap","grid-row","grid-row-end","grid-row-start","grid-template","grid-template-areas","grid-template-columns","grid-template-rows","hanging-punctuation","height","hyphenate-character","hyphenate-limit-chars","hyphens","icon","image-orientation","image-rendering","image-resolution","ime-mode","initial-letter","initial-letter-align","inline-size","inset","inset-area","inset-block","inset-block-end","inset-block-start","inset-inline","inset-inline-end","inset-inline-start","isolation","justify-content","justify-items","justify-self","kerning","left","letter-spacing","lighting-color","line-break","line-height","line-height-step","list-style","list-style-image","list-style-position","list-style-type","margin","margin-block","margin-block-end","margin-block-start","margin-bottom","margin-inline","margin-inline-end","margin-inline-start","margin-left","margin-right","margin-top","margin-trim","marker","marker-end","marker-mid","marker-start","marks","mask","mask-border","mask-border-mode","mask-border-outset","mask-border-repeat","mask-border-slice","mask-border-source","mask-border-width","mask-clip","mask-composite","mask-image","mask-mode","mask-origin","mask-position","mask-repeat","mask-size","mask-type","masonry-auto-flow","math-depth","math-shift","math-style","max-block-size","max-height","max-inline-size","max-width","min-block-size","min-height","min-inline-size","min-width","mix-blend-mode","nav-down","nav-index","nav-left","nav-right","nav-up","none","normal","object-fit","object-position","offset","offset-anchor","offset-distance","offset-path","offset-position","offset-rotate","opacity","order","orphans","outline","outline-color","outline-offset","outline-style","outline-width","overflow","overflow-anchor","overflow-block","overflow-clip-margin","overflow-inline","overflow-wrap","overflow-x","overflow-y","overlay","overscroll-behavior","overscroll-behavior-block","overscroll-behavior-inline","overscroll-behavior-x","overscroll-behavior-y","padding","padding-block","padding-block-end","padding-block-start","padding-bottom","padding-inline","padding-inline-end","padding-inline-start","padding-left","padding-right","padding-top","page","page-break-after","page-break-before","page-break-inside","paint-order","pause","pause-after","pause-before","perspective","perspective-origin","place-content","place-items","place-self","pointer-events","position","position-anchor","position-visibility","print-color-adjust","quotes","r","resize","rest","rest-after","rest-before","right","rotate","row-gap","ruby-align","ruby-position","scale","scroll-behavior","scroll-margin","scroll-margin-block","scroll-margin-block-end","scroll-margin-block-start","scroll-margin-bottom","scroll-margin-inline","scroll-margin-inline-end","scroll-margin-inline-start","scroll-margin-left","scroll-margin-right","scroll-margin-top","scroll-padding","scroll-padding-block","scroll-padding-block-end","scroll-padding-block-start","scroll-padding-bottom","scroll-padding-inline","scroll-padding-inline-end","scroll-padding-inline-start","scroll-padding-left","scroll-padding-right","scroll-padding-top","scroll-snap-align","scroll-snap-stop","scroll-snap-type","scroll-timeline","scroll-timeline-axis","scroll-timeline-name","scrollbar-color","scrollbar-gutter","scrollbar-width","shape-image-threshold","shape-margin","shape-outside","shape-rendering","speak","speak-as","src","stop-color","stop-opacity","stroke","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","tab-size","table-layout","text-align","text-align-all","text-align-last","text-anchor","text-combine-upright","text-decoration","text-decoration-color","text-decoration-line","text-decoration-skip","text-decoration-skip-ink","text-decoration-style","text-decoration-thickness","text-emphasis","text-emphasis-color","text-emphasis-position","text-emphasis-style","text-indent","text-justify","text-orientation","text-overflow","text-rendering","text-shadow","text-size-adjust","text-transform","text-underline-offset","text-underline-position","text-wrap","text-wrap-mode","text-wrap-style","timeline-scope","top","touch-action","transform","transform-box","transform-origin","transform-style","transition","transition-behavior","transition-delay","transition-duration","transition-property","transition-timing-function","translate","unicode-bidi","user-modify","user-select","vector-effect","vertical-align","view-timeline","view-timeline-axis","view-timeline-inset","view-timeline-name","view-transition-name","visibility","voice-balance","voice-duration","voice-family","voice-pitch","voice-range","voice-rate","voice-stress","voice-volume","white-space","white-space-collapse","widows","width","will-change","word-break","word-spacing","word-wrap","writing-mode","x","y","z-index","zoom"].sort().reverse();function hn(e){let n=e.regex,t=Kt(e),i={begin:/-(webkit|moz|ms|o)-(?=[a-z])/},l="and or not only",u=/@-?\w[\w]*(-\w+)*/,r="[a-zA-Z-][a-zA-Z0-9_-]*",a=[e.APOS_STRING_MODE,e.QUOTE_STRING_MODE];return{name:"CSS",case_insensitive:!0,illegal:/[=|'\$]/,keywords:{keyframePosition:"from to"},classNameAliases:{keyframePosition:"selector-tag"},contains:[t.BLOCK_COMMENT,i,t.CSS_NUMBER_MODE,{className:"selector-id",begin:/#[A-Za-z0-9_-]+/,relevance:0},{className:"selector-class",begin:"\\."+r,relevance:0},t.ATTRIBUTE_SELECTOR_MODE,{className:"selector-pseudo",variants:[{begin:":("+Xt.join("|")+")"},{begin:":(:)?("+Qt.join("|")+")"}]},t.CSS_VARIABLE,{className:"attribute",begin:"\\b("+Vt.join("|")+")\\b"},{begin:/:/,end:/[;}{]/,contains:[t.BLOCK_COMMENT,t.HEXCOLOR,t.IMPORTANT,t.CSS_NUMBER_MODE,...a,{begin:/(url|data-uri)\(/,end:/\)/,relevance:0,keywords:{built_in:"url data-uri"},contains:[...a,{className:"string",begin:/[^)]/,endsWithParent:!0,excludeEnd:!0}]},t.FUNCTION_DISPATCH]},{begin:n.lookahead(/@/),end:"[{;]",relevance:0,illegal:/:/,contains:[{className:"keyword",begin:u},{begin:/\s/,endsWithParent:!0,excludeEnd:!0,relevance:0,keywords:{$pattern:/[a-z-]+/,keyword:l,attribute:qt.join(" ")},contains:[{begin:/[a-z-]+(?=:)/,className:"attribute"},...a,t.CSS_NUMBER_MODE]}]},{className:"selector-tag",begin:"\\b("+Yt.join("|")+")\\b"}]}}function Nn(e){let n=e.regex,t=n.concat(/[\p{L}_]/u,n.optional(/[\p{L}0-9_.-]*:/u),/[\p{L}0-9_.-]*/u),i=/[\p{L}0-9._:-]+/u,l={className:"symbol",begin:/&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/},u={begin:/\s/,contains:[{className:"keyword",begin:/#?[a-z_][a-z1-9_-]+/,illegal:/\n/}]},r=e.inherit(u,{begin:/\(/,end:/\)/}),a=e.inherit(e.APOS_STRING_MODE,{className:"string"}),s=e.inherit(e.QUOTE_STRING_MODE,{className:"string"}),d={endsWithParent:!0,illegal:/</,relevance:0,contains:[{className:"attr",begin:i,relevance:0},{begin:/=\s*/,relevance:0,contains:[{className:"string",endsParent:!0,variants:[{begin:/"/,end:/"/,contains:[l]},{begin:/'/,end:/'/,contains:[l]},{begin:/[^\s"'=<>`]+/}]}]}]};return{name:"HTML, XML",aliases:["html","xhtml","rss","atom","xjb","xsd","xsl","plist","wsf","svg"],case_insensitive:!0,unicodeRegex:!0,contains:[{className:"meta",begin:/<![a-z]/,end:/>/,relevance:10,contains:[u,s,a,r,{begin:/\[/,end:/\]/,contains:[{className:"meta",begin:/<![a-z]/,end:/>/,contains:[u,r,s,a]}]}]},e.COMMENT(/<!--/,/-->/,{relevance:10}),{begin:/<!\[CDATA\[/,end:/\]\]>/,relevance:10},l,{className:"meta",end:/\?>/,variants:[{begin:/<\?xml/,relevance:10,contains:[s]},{begin:/<\?[a-z][a-z0-9]+/}]},{className:"tag",begin:/<style(?=\s|>)/,end:/>/,keywords:{name:"style"},contains:[d],starts:{end:/<\/style>/,returnEnd:!0,subLanguage:["css","xml"]}},{className:"tag",begin:/<script(?=\s|>)/,end:/>/,keywords:{name:"script"},contains:[d],starts:{end:/<\/script>/,returnEnd:!0,subLanguage:["javascript","handlebars","xml"]}},{className:"tag",begin:/<>|<\/>/},{className:"tag",begin:n.concat(/</,n.lookahead(n.concat(t,n.either(/\/>/,/>/,/\s/)))),end:/\/?>/,contains:[{className:"name",begin:t,relevance:0,starts:d}]},{className:"tag",begin:n.concat(/<\//,n.lookahead(n.concat(t,/>/))),contains:[{className:"name",begin:t,relevance:0},{begin:/>/,relevance:0,endsParent:!0}]}]}}function yn(e){let n=e.regex,t={},i={begin:/\$\{/,end:/\}/,contains:["self",{begin:/:-/,contains:[t]}]};Object.assign(t,{className:"variable",variants:[{begin:n.concat(/\$[\w\d#@][\w\d_]*/,"(?![\\w\\d])(?![$])")},i]});let l={className:"subst",begin:/\$\(/,end:/\)/,contains:[e.BACKSLASH_ESCAPE]},u=e.inherit(e.COMMENT(),{match:[/(^|\s)/,/#.*$/],scope:{2:"comment"}}),r={begin:/<<-?\s*(?=\w+)/,starts:{contains:[e.END_SAME_AS_BEGIN({begin:/(\w+)/,end:/(\w+)/,className:"string"})]}},a={className:"string",begin:/"/,end:/"/,contains:[e.BACKSLASH_ESCAPE,t,l]};l.contains.push(a);let s={match:/\\"/},d={className:"string",begin:/'/,end:/'/},b={match:/\\'/},N={begin:/\$?\(\(/,end:/\)\)/,contains:[{begin:/\d+#[0-9a-f]+/,className:"number"},e.NUMBER_MODE,t]},h=["fish","bash","zsh","sh","csh","ksh","tcsh","dash","scsh"],y=e.SHEBANG({binary:`(${h.join("|")})`,relevance:10}),O={className:"function",begin:/\w[\w\d_]*\s*\(\s*\)\s*\{/,returnBegin:!0,contains:[e.inherit(e.TITLE_MODE,{begin:/\w[\w\d_]*/})],relevance:0},A=["if","then","else","elif","fi","time","for","while","until","in","do","done","case","esac","coproc","function","select"],w=["true","false"],x={match:/(\/[a-z._-]+)+/},I=["break","cd","continue","eval","exec","exit","export","getopts","hash","pwd","readonly","return","shift","test","times","trap","umask","unset"],U=["alias","bind","builtin","caller","command","declare","echo","enable","help","let","local","logout","mapfile","printf","read","readarray","source","sudo","type","typeset","ulimit","unalias"],P=["autoload","bg","bindkey","bye","cap","chdir","clone","comparguments","compcall","compctl","compdescribe","compfiles","compgroups","compquote","comptags","comptry","compvalues","dirs","disable","disown","echotc","echoti","emulate","fc","fg","float","functions","getcap","getln","history","integer","jobs","kill","limit","log","noglob","popd","print","pushd","pushln","rehash","sched","setcap","setopt","stat","suspend","ttyctl","unfunction","unhash","unlimit","unsetopt","vared","wait","whence","where","which","zcompile","zformat","zftp","zle","zmodload","zparseopts","zprof","zpty","zregexparse","zsocket","zstyle","ztcp"],M=["chcon","chgrp","chown","chmod","cp","dd","df","dir","dircolors","ln","ls","mkdir","mkfifo","mknod","mktemp","mv","realpath","rm","rmdir","shred","sync","touch","truncate","vdir","b2sum","base32","base64","cat","cksum","comm","csplit","cut","expand","fmt","fold","head","join","md5sum","nl","numfmt","od","paste","ptx","pr","sha1sum","sha224sum","sha256sum","sha384sum","sha512sum","shuf","sort","split","sum","tac","tail","tr","tsort","unexpand","uniq","wc","arch","basename","chroot","date","dirname","du","echo","env","expr","factor","groups","hostid","id","link","logname","nice","nohup","nproc","pathchk","pinky","printenv","printf","pwd","readlink","runcon","seq","sleep","stat","stdbuf","stty","tee","test","timeout","tty","uname","unlink","uptime","users","who","whoami","yes"];return{name:"Bash",aliases:["sh","zsh"],keywords:{$pattern:/\b[a-z][a-z0-9._-]+\b/,keyword:A,literal:w,built_in:[...I,...U,"set","shopt",...P,...M]},contains:[y,e.SHEBANG(),O,N,u,r,x,a,s,d,b,t]}}function Sn(e){let n=e.regex,t=e.COMMENT("--","$"),i={scope:"string",variants:[{begin:/'/,end:/'/,contains:[{match:/''/}]}]},l={begin:/"/,end:/"/,contains:[{match:/""/}]},u=["true","false","unknown"],r=["double precision","large object","with timezone","without timezone"],a=["bigint","binary","blob","boolean","char","character","clob","date","dec","decfloat","decimal","float","int","integer","interval","nchar","nclob","national","numeric","real","row","smallint","time","timestamp","varchar","varying","varbinary"],s=["add","asc","collation","desc","final","first","last","view"],d=["abs","acos","all","allocate","alter","and","any","are","array","array_agg","array_max_cardinality","as","asensitive","asin","asymmetric","at","atan","atomic","authorization","avg","begin","begin_frame","begin_partition","between","bigint","binary","blob","boolean","both","by","call","called","cardinality","cascaded","case","cast","ceil","ceiling","char","char_length","character","character_length","check","classifier","clob","close","coalesce","collate","collect","column","commit","condition","connect","constraint","contains","convert","copy","corr","corresponding","cos","cosh","count","covar_pop","covar_samp","create","cross","cube","cume_dist","current","current_catalog","current_date","current_default_transform_group","current_path","current_role","current_row","current_schema","current_time","current_timestamp","current_path","current_role","current_transform_group_for_type","current_user","cursor","cycle","date","day","deallocate","dec","decimal","decfloat","declare","default","define","delete","dense_rank","deref","describe","deterministic","disconnect","distinct","double","drop","dynamic","each","element","else","empty","end","end_frame","end_partition","end-exec","equals","escape","every","except","exec","execute","exists","exp","external","extract","false","fetch","filter","first_value","float","floor","for","foreign","frame_row","free","from","full","function","fusion","get","global","grant","group","grouping","groups","having","hold","hour","identity","in","indicator","initial","inner","inout","insensitive","insert","int","integer","intersect","intersection","interval","into","is","join","json_array","json_arrayagg","json_exists","json_object","json_objectagg","json_query","json_table","json_table_primitive","json_value","lag","language","large","last_value","lateral","lead","leading","left","like","like_regex","listagg","ln","local","localtime","localtimestamp","log","log10","lower","match","match_number","match_recognize","matches","max","member","merge","method","min","minute","mod","modifies","module","month","multiset","national","natural","nchar","nclob","new","no","none","normalize","not","nth_value","ntile","null","nullif","numeric","octet_length","occurrences_regex","of","offset","old","omit","on","one","only","open","or","order","out","outer","over","overlaps","overlay","parameter","partition","pattern","per","percent","percent_rank","percentile_cont","percentile_disc","period","portion","position","position_regex","power","precedes","precision","prepare","primary","procedure","ptf","range","rank","reads","real","recursive","ref","references","referencing","regr_avgx","regr_avgy","regr_count","regr_intercept","regr_r2","regr_slope","regr_sxx","regr_sxy","regr_syy","release","result","return","returns","revoke","right","rollback","rollup","row","row_number","rows","running","savepoint","scope","scroll","search","second","seek","select","sensitive","session_user","set","show","similar","sin","sinh","skip","smallint","some","specific","specifictype","sql","sqlexception","sqlstate","sqlwarning","sqrt","start","static","stddev_pop","stddev_samp","submultiset","subset","substring","substring_regex","succeeds","sum","symmetric","system","system_time","system_user","table","tablesample","tan","tanh","then","time","timestamp","timezone_hour","timezone_minute","to","trailing","translate","translate_regex","translation","treat","trigger","trim","trim_array","true","truncate","uescape","union","unique","unknown","unnest","update","upper","user","using","value","values","value_of","var_pop","var_samp","varbinary","varchar","varying","versioning","when","whenever","where","width_bucket","window","with","within","without","year"],b=["abs","acos","array_agg","asin","atan","avg","cast","ceil","ceiling","coalesce","corr","cos","cosh","count","covar_pop","covar_samp","cume_dist","dense_rank","deref","element","exp","extract","first_value","floor","json_array","json_arrayagg","json_exists","json_object","json_objectagg","json_query","json_table","json_table_primitive","json_value","lag","last_value","lead","listagg","ln","log","log10","lower","max","min","mod","nth_value","ntile","nullif","percent_rank","percentile_cont","percentile_disc","position","position_regex","power","rank","regr_avgx","regr_avgy","regr_count","regr_intercept","regr_r2","regr_slope","regr_sxx","regr_sxy","regr_syy","row_number","sin","sinh","sqrt","stddev_pop","stddev_samp","substring","substring_regex","sum","tan","tanh","translate","translate_regex","treat","trim","trim_array","unnest","upper","value_of","var_pop","var_samp","width_bucket"],N=["current_catalog","current_date","current_default_transform_group","current_path","current_role","current_schema","current_transform_group_for_type","current_user","session_user","system_time","system_user","current_time","localtime","current_timestamp","localtimestamp"],h=["create table","insert into","primary key","foreign key","not null","alter table","add constraint","grouping sets","on overflow","character set","respect nulls","ignore nulls","nulls first","nulls last","depth first","breadth first"],y=b,O=[...d,...s].filter(M=>!b.includes(M)),A={scope:"variable",match:/@[a-z0-9][a-z0-9_]*/},w={scope:"operator",match:/[-+*/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?/,relevance:0},x={match:n.concat(/\b/,n.either(...y),/\s*\(/),relevance:0,keywords:{built_in:y}};function I(M){return n.concat(/\b/,n.either(...M.map(k=>k.replace(/\s+/,"\\s+"))),/\b/)}let U={scope:"keyword",match:I(h),relevance:0};function P(M,{exceptions:k,when:Y}={}){let L=Y;return k=k||[],M.map($=>$.match(/\|\d+$/)||k.includes($)?$:L($)?`${$}|0`:$)}return{name:"SQL",case_insensitive:!0,illegal:/[{}]|<\//,keywords:{$pattern:/\b[\w\.]+/,keyword:P(O,{when:M=>M.length<3}),literal:u,type:a,built_in:N},contains:[{scope:"type",match:I(r)},U,x,A,i,l,e.C_NUMBER_MODE,e.C_BLOCK_COMMENT_MODE,t,w]}}function Tn(e){let n=e.regex,t={begin:/<\/?[A-Za-z_]/,end:">",subLanguage:"xml",relevance:0},i={begin:"^[-\\*]{3,}",end:"$"},l={className:"code",variants:[{begin:"(`{3,})[^`](.|\\n)*?\\1`*[ ]*"},{begin:"(~{3,})[^~](.|\\n)*?\\1~*[ ]*"},{begin:"```",end:"```+[ ]*$"},{begin:"~~~",end:"~~~+[ ]*$"},{begin:"`.+?`"},{begin:"(?=^( {4}|\\t))",contains:[{begin:"^( {4}|\\t)",end:"(\\n)$"}],relevance:0}]},u={className:"bullet",begin:"^[ 	]*([*+-]|(\\d+\\.))(?=\\s+)",end:"\\s+",excludeEnd:!0},r={begin:/^\[[^\n]+\]:/,returnBegin:!0,contains:[{className:"symbol",begin:/\[/,end:/\]/,excludeBegin:!0,excludeEnd:!0},{className:"link",begin:/:\s*/,end:/$/,excludeBegin:!0}]},a=/[A-Za-z][A-Za-z0-9+.-]*/,s={variants:[{begin:/\[.+?\]\[.*?\]/,relevance:0},{begin:/\[.+?\]\(((data|javascript|mailto):|(?:http|ftp)s?:\/\/).*?\)/,relevance:2},{begin:n.concat(/\[.+?\]\(/,a,/:\/\/.*?\)/),relevance:2},{begin:/\[.+?\]\([./?&#].*?\)/,relevance:1},{begin:/\[.*?\]\(.*?\)/,relevance:0}],returnBegin:!0,contains:[{match:/\[(?=\])/},{className:"string",relevance:0,begin:"\\[",end:"\\]",excludeBegin:!0,returnEnd:!0},{className:"link",relevance:0,begin:"\\]\\(",end:"\\)",excludeBegin:!0,excludeEnd:!0},{className:"symbol",relevance:0,begin:"\\]\\[",end:"\\]",excludeBegin:!0,excludeEnd:!0}]},d={className:"strong",contains:[],variants:[{begin:/_{2}(?!\s)/,end:/_{2}/},{begin:/\*{2}(?!\s)/,end:/\*{2}/}]},b={className:"emphasis",contains:[],variants:[{begin:/\*(?![*\s])/,end:/\*/},{begin:/_(?![_\s])/,end:/_/,relevance:0}]},N=e.inherit(d,{contains:[]}),h=e.inherit(b,{contains:[]});d.contains.push(h),b.contains.push(N);let y=[t,s];return[d,b,N,h].forEach(x=>{x.contains=x.contains.concat(y)}),y=y.concat(d,b),{name:"Markdown",aliases:["md","mkdown","mkd"],contains:[{className:"section",variants:[{begin:"^#{1,6}",end:"$",contains:y},{begin:"(?=^.+?\\n[=-]{2,}$)",contains:[{begin:"^[=-]*$"},{begin:"^",end:"\\n",contains:y}]}]},t,u,d,b,{className:"quote",begin:"^>\\s+",contains:y,end:"$"},l,i,s,r,{scope:"literal",match:/&([a-zA-Z0-9]+|#[0-9]{1,7}|#[Xx][0-9a-fA-F]{1,6});/}]}}function An(e){let u={keyword:["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var"],type:["bool","byte","complex64","complex128","error","float32","float64","int8","int16","int32","int64","string","uint8","uint16","uint32","uint64","int","uint","uintptr","rune"],literal:["true","false","iota","nil"],built_in:["append","cap","close","complex","copy","imag","len","make","new","panic","print","println","real","recover","delete"]};return{name:"Go",aliases:["golang"],keywords:u,illegal:"</",contains:[e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,{className:"string",variants:[e.QUOTE_STRING_MODE,e.APOS_STRING_MODE,{begin:"`",end:"`"}]},{className:"number",variants:[{match:/-?\b0[xX]\.[a-fA-F0-9](_?[a-fA-F0-9])*[pP][+-]?\d(_?\d)*i?/,relevance:0},{match:/-?\b0[xX](_?[a-fA-F0-9])+((\.([a-fA-F0-9](_?[a-fA-F0-9])*)?)?[pP][+-]?\d(_?\d)*)?i?/,relevance:0},{match:/-?\b0[oO](_?[0-7])*i?/,relevance:0},{match:/-?\.\d(_?\d)*([eE][+-]?\d(_?\d)*)?i?/,relevance:0},{match:/-?\b\d(_?\d)*(\.(\d(_?\d)*)?)?([eE][+-]?\d(_?\d)*)?i?/,relevance:0}]},{begin:/:=/},{className:"function",beginKeywords:"func",end:"\\s*(\\{|$)",excludeEnd:!0,contains:[e.TITLE_MODE,{className:"params",begin:/\(/,end:/\)/,endsParent:!0,keywords:u,illegal:/["']/}]}]}}function vn(e){let n=e.regex,t=/(r#)?/,i=n.concat(t,e.UNDERSCORE_IDENT_RE),l=n.concat(t,e.IDENT_RE),u={className:"title.function.invoke",relevance:0,begin:n.concat(/\b/,/(?!let|for|while|if|else|match\b)/,l,n.lookahead(/\s*\(/))},r="([ui](8|16|32|64|128|size)|f(32|64))?",a=["abstract","as","async","await","become","box","break","const","continue","crate","do","dyn","else","enum","extern","false","final","fn","for","if","impl","in","let","loop","macro","match","mod","move","mut","override","priv","pub","ref","return","self","Self","static","struct","super","trait","true","try","type","typeof","union","unsafe","unsized","use","virtual","where","while","yield"],s=["true","false","Some","None","Ok","Err"],d=["drop ","Copy","Send","Sized","Sync","Drop","Fn","FnMut","FnOnce","ToOwned","Clone","Debug","PartialEq","PartialOrd","Eq","Ord","AsRef","AsMut","Into","From","Default","Iterator","Extend","IntoIterator","DoubleEndedIterator","ExactSizeIterator","SliceConcatExt","ToString","assert!","assert_eq!","bitflags!","bytes!","cfg!","col!","concat!","concat_idents!","debug_assert!","debug_assert_eq!","env!","eprintln!","panic!","file!","format!","format_args!","include_bytes!","include_str!","line!","local_data_key!","module_path!","option_env!","print!","println!","select!","stringify!","try!","unimplemented!","unreachable!","vec!","write!","writeln!","macro_rules!","assert_ne!","debug_assert_ne!"],b=["i8","i16","i32","i64","i128","isize","u8","u16","u32","u64","u128","usize","f32","f64","str","char","bool","Box","Option","Result","String","Vec"];return{name:"Rust",aliases:["rs"],keywords:{$pattern:e.IDENT_RE+"!?",type:b,keyword:a,literal:s,built_in:d},illegal:"</",contains:[e.C_LINE_COMMENT_MODE,e.COMMENT("/\\*","\\*/",{contains:["self"]}),e.inherit(e.QUOTE_STRING_MODE,{begin:/b?"/,illegal:null}),{className:"symbol",begin:/'[a-zA-Z_][a-zA-Z0-9_]*(?!')/},{scope:"string",variants:[{begin:/b?r(#*)"(.|\n)*?"\1(?!#)/},{begin:/b?'/,end:/'/,contains:[{scope:"char.escape",match:/\\('|\w|x\w{2}|u\w{4}|U\w{8})/}]}]},{className:"number",variants:[{begin:"\\b0b([01_]+)"+r},{begin:"\\b0o([0-7_]+)"+r},{begin:"\\b0x([A-Fa-f0-9_]+)"+r},{begin:"\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)"+r}],relevance:0},{begin:[/fn/,/\s+/,i],className:{1:"keyword",3:"title.function"}},{className:"meta",begin:"#!?\\[",end:"\\]",contains:[{className:"string",begin:/"/,end:/"/,contains:[e.BACKSLASH_ESCAPE]}]},{begin:[/let/,/\s+/,/(?:mut\s+)?/,i],className:{1:"keyword",3:"keyword",4:"variable"}},{begin:[/for/,/\s+/,i,/\s+/,/in/],className:{1:"keyword",3:"variable",5:"keyword"}},{begin:[/type/,/\s+/,i],className:{1:"keyword",3:"title.class"}},{begin:[/(?:trait|enum|struct|union|impl|for)/,/\s+/,i],className:{1:"keyword",3:"title.class"}},{begin:e.IDENT_RE+"::",keywords:{keyword:"Self",built_in:d,type:b}},{className:"punctuation",begin:"->"},u]}}var ee="[0-9](_*[0-9])*",me=`\\.(${ee})`,_e="[0-9a-fA-F](_*[0-9a-fA-F])*",On={className:"number",variants:[{begin:`(\\b(${ee})((${me})|\\.)?|(${me}))[eE][+-]?(${ee})[fFdD]?\\b`},{begin:`\\b(${ee})((${me})[fFdD]?\\b|\\.([fFdD]\\b)?)`},{begin:`(${me})[fFdD]?\\b`},{begin:`\\b(${ee})[fFdD]\\b`},{begin:`\\b0[xX]((${_e})\\.?|(${_e})?\\.(${_e}))[pP][+-]?(${ee})[fFdD]?\\b`},{begin:"\\b(0|[1-9](_*[0-9])*)[lL]?\\b"},{begin:`\\b0[xX](${_e})[lL]?\\b`},{begin:"\\b0(_*[0-7])*[lL]?\\b"},{begin:"\\b0[bB][01](_*[01])*[lL]?\\b"}],relevance:0};function Rn(e,n,t){return t===-1?"":e.replace(n,i=>Rn(e,n,t-1))}function wn(e){let n=e.regex,t="[\xC0-\u02B8a-zA-Z_$][\xC0-\u02B8a-zA-Z_$0-9]*",i=t+Rn("(?:<"+t+"~~~(?:\\s*,\\s*"+t+"~~~)*>)?",/~~~/g,2),s={keyword:["synchronized","abstract","private","var","static","if","const ","for","while","strictfp","finally","protected","import","native","final","void","enum","else","break","transient","catch","instanceof","volatile","case","assert","package","default","public","try","switch","continue","throws","protected","public","private","module","requires","exports","do","sealed","yield","permits","goto","when"],literal:["false","true","null"],type:["char","boolean","long","float","int","byte","short","double"],built_in:["super","this"]},d={className:"meta",begin:"@"+t,contains:[{begin:/\(/,end:/\)/,contains:["self"]}]},b={className:"params",begin:/\(/,end:/\)/,keywords:s,relevance:0,contains:[e.C_BLOCK_COMMENT_MODE],endsParent:!0};return{name:"Java",aliases:["jsp"],keywords:s,illegal:/<\/|#/,contains:[e.COMMENT("/\\*\\*","\\*/",{relevance:0,contains:[{begin:/\w+@/,relevance:0},{className:"doctag",begin:"@[A-Za-z]+"}]}),{begin:/import java\.[a-z]+\./,keywords:"import",relevance:2},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE,{begin:/"""/,end:/"""/,className:"string",contains:[e.BACKSLASH_ESCAPE]},e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,{match:[/\b(?:class|interface|enum|extends|implements|new)/,/\s+/,t],className:{1:"keyword",3:"title.class"}},{match:/non-sealed/,scope:"keyword"},{begin:[n.concat(/(?!else)/,t),/\s+/,t,/\s+/,/=(?!=)/],className:{1:"type",3:"variable",5:"operator"}},{begin:[/record/,/\s+/,t],className:{1:"keyword",3:"title.class"},contains:[b,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},{beginKeywords:"new throw return else",relevance:0},{begin:["(?:"+i+"\\s+)",e.UNDERSCORE_IDENT_RE,/\s*(?=\()/],className:{2:"title.function"},keywords:s,contains:[{className:"params",begin:/\(/,end:/\)/,keywords:s,relevance:0,contains:[d,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,On,e.C_BLOCK_COMMENT_MODE]},e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE]},On,d]}}function xn(e){return{name:"Dockerfile",aliases:["docker"],case_insensitive:!0,keywords:["from","maintainer","expose","env","arg","user","onbuild","stopsignal"],contains:[e.HASH_COMMENT_MODE,e.APOS_STRING_MODE,e.QUOTE_STRING_MODE,e.NUMBER_MODE,{beginKeywords:"run cmd entrypoint volume add copy workdir label healthcheck shell",starts:{end:/[^\\]$/,subLanguage:"bash"}}],illegal:"</"}}function Mn(e){let n=e.regex,t={className:"number",relevance:0,variants:[{begin:/([+-]+)?[\d]+_[\d_]+/},{begin:e.NUMBER_RE}]},i=e.COMMENT();i.variants=[{begin:/;/,end:/$/},{begin:/#/,end:/$/}];let l={className:"variable",variants:[{begin:/\$[\w\d"][\w\d_]*/},{begin:/\$\{(.*?)\}/}]},u={className:"literal",begin:/\bon|off|true|false|yes|no\b/},r={className:"string",contains:[e.BACKSLASH_ESCAPE],variants:[{begin:"'''",end:"'''",relevance:10},{begin:'"""',end:'"""',relevance:10},{begin:'"',end:'"'},{begin:"'",end:"'"}]},a={begin:/\[/,end:/\]/,contains:[i,u,l,r,t,"self"],relevance:0},s=/[A-Za-z0-9_-]+/,d=/"(\\"|[^"])*"/,b=/'[^']*'/,N=n.either(s,d,b),h=n.concat(N,"(\\s*\\.\\s*",N,")*",n.lookahead(/\s*=\s*[^#\s]/));return{name:"TOML, also INI",aliases:["toml"],case_insensitive:!0,illegal:/\S/,contains:[i,{className:"section",begin:/\[+/,end:/\]+/},{begin:h,className:"attr",starts:{end:/$/,contains:[i,a,u,l,r,t]}}]}}function kn(e){let n=e.regex;return{name:"Diff",aliases:["patch"],contains:[{className:"meta",relevance:10,match:n.either(/^@@ +-\d+,\d+ +\+\d+,\d+ +@@/,/^\*\*\* +\d+,\d+ +\*\*\*\*$/,/^--- +\d+,\d+ +----$/)},{className:"comment",variants:[{begin:n.either(/Index: /,/^index/,/={3,}/,/^-{3}/,/^\*{3} /,/^\+{3}/,/^diff --git/),end:/$/},{match:/^\*{15}$/}]},{className:"addition",begin:/^\+/,end:/$/},{className:"deletion",begin:/^-/,end:/$/},{className:"addition",begin:/^!/,end:/$/}]}}for(let[e,n]of Object.entries({javascript:on,typescript:pn,python:mn,json:_n,yaml:En,css:hn,xml:Nn,bash:yn,sql:Sn,markdown:Tn,go:An,rust:vn,java:wn,dockerfile:xn,ini:Mn,diff:kn}))fe.registerLanguage(e,n);function In(e){let n=String(e).split("/").pop().toLowerCase();if(n==="dockerfile"||n.endsWith(".dockerfile")||n.startsWith("dockerfile."))return"dockerfile";if(n===".env"||n.startsWith(".env."))return"ini";let t=n.split(".").pop();return{js:"javascript",jsx:"javascript",mjs:"javascript",cjs:"javascript",ts:"typescript",tsx:"typescript",py:"python",pyi:"python",json:"json",jsonc:"json",yml:"yaml",yaml:"yaml",css:"css",html:"xml",htm:"xml",xml:"xml",svg:"xml",vue:"xml",sh:"bash",bash:"bash",zsh:"bash",sql:"sql",md:"markdown",markdown:"markdown",go:"go",rs:"rust",java:"java",ini:"ini",toml:"ini",cfg:"ini",diff:"diff",patch:"diff"}[t]||null}function Jt(e){return e.replace(/&(amp|lt|gt|quot|#x27|#39);/g,(n,t)=>({amp:"&",lt:"<",gt:">",quot:'"',"#x27":"'","#39":"'"})[t])}function Cn(e,n){if(!n||!fe.getLanguage(n))return e.split(`
`).map(u=>[{text:u,classes:""}]);let t=fe.highlight(e,{language:n,ignoreIllegals:!0}).value,i=[],l=[[]];for(let u of t.split(/(<span class="[^"]*">|<\/span>)/g)){if(u.startsWith('<span class="')){i.push(u.slice(13,-2));continue}if(u==="</span>"){i.pop();continue}Jt(u).split(`
`).forEach((a,s)=>{s&&l.push([]),a&&l[l.length-1].push({text:a,classes:i.join(" ")})})}return l}function jt(e,n,t=!0){let i=In(n);if(!t||!i||e.length>5e3||e.reduce((a,s)=>a+s.text.length,0)>2e5)return null;let l=new Map,u=[],r=()=>{for(let a of["old","new"]){let s=u.filter(({row:b})=>b.kind==="ctx"||b.kind===(a==="old"?"del":"add"));if(!s.length)continue;let d=Cn(s.map(({row:b})=>b.text.slice(1)).join(`
`),i);s.forEach(({index:b},N)=>l.set(b,d[N]||[]))}u=[]};try{return e.forEach((a,s)=>{a.kind==="hunk"||a.kind==="meta"?r():["add","del","ctx"].includes(a.kind)&&u.push({row:a,index:s})}),r(),l}catch{return null}}return Xn(ei);})();

    // END BUNDLED SYNTAX

    /** The graph tab's identity, and the key its body and title register under. */
    const ID = 'dsh-git-graph'

    /** The graph tab's kind. */
    const KIND = 'git-graph'

    /** The commit-detail tab's identity and kind. */
    const COMMIT_ID = 'dsh-git-graph/commit'
    const COMMIT_KIND = 'git-commit'

    /** The diff tab's identity and kind. */
    const DIFF_ID = 'dsh-git-graph/diff'
    const DIFF_KIND = 'git-diff'

    /** The working-tree tab's identity and kind. */
    const CHANGES_ID = 'dsh-git-graph/changes'
    const CHANGES_KIND = 'git-changes'

    /** Exact route the host half serves. */
    const ROUTE = '/api/dsh-git-graph'

    /**
     * The empty tree's object id, used as the "before" side of a root commit.
     *
     * Git has a well-known id for the empty tree in its SHA-1 form. A repository
     * using a different object format would need that format's id; the host half
     * handles the root-commit case itself and never needs this from the browser,
     * so the constant is only a fallback for a commit whose parent list arrived
     * empty before the host answered.
     */
    const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

    /** Lane colours, cycled by lane index. Chosen to stay legible on both themes. */
    const LANE_COLORS = [
      '#4c9aff', '#34c759', '#ff9f0a', '#bf5af2',
      '#ff453a', '#5ac8fa', '#ffd60a', '#ff6482',
    ]

    /** Row geometry of the graph: one commit occupies one row of this height. */
    const ROW_H = 26

    /** Horizontal distance between two lanes. */
    const LANE_W = 14

    /** Left inset of the first lane. */
    const LANE_X0 = 12

    /** Radius of a commit's dot. */
    const DOT_R = 4

    /**
     * Ask the host half one question.
     *
     * @param request - the operation and its arguments.
     * @param signal - cancellation from the tab's lifetime.
     * @returns the answer, or a rejection carrying the host's message.
     */
    async function call(request, signal) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
      const payload = await response.json().catch(() => null)
      if (payload === null) throw new Error('git-graph: the host sent no answer')
      if (payload.ok !== true) throw new Error(payload.error ?? 'git-graph: the request failed')
      return payload.result
    }

    // BEGIN GRAPH LAYOUT
    /**
     * Topological, newest-first history. Live tracks reserve their columns until
     * their actual parent dot. The oldest incoming lane owns that dot and its
     * first-parent continuation. A shared ancestor gets a trunk and a return
     * rail: further topic branches join that rail near their child, rather than
     * allocating one permanent column per historical merge. Columns are reusable;
     * colour identities survive independently of columns.
     */
    function layout(commits, hasMore) {
      const index = new Map(commits.map((commit, row) => [commit.hash, row]))
      // Identify first-parent spines before routing. This lets fifty short
      // branches with the same base share ONE return rail while the base's
      // own spine keeps its separate, stable lane.
      const owner = new Map()
      commits.forEach(commit => {
        let hash = commit.hash
        while (hash !== undefined && !owner.has(hash)) {
          owner.set(hash, commit.hash)
          hash = commits[index.get(hash)]?.parents[0]
        }
      })
      const tracks = []
      const rows = []
      const edges = []
      let nextSlot = 0
      let columnCount = 1

      const freeColumn = () => {
        const free = tracks.findIndex(track => track === null)
        return free === -1 ? tracks.length : free
      }
      const occupy = (column, track) => {
        tracks[column] = track
        columnCount = Math.max(columnCount, column + 1)
      }

      commits.forEach((commit, row) => {
        const incoming = []
        tracks.forEach((track, column) => {
          if (track !== null && track.parent === commit.hash) incoming.push({ ...track, column })
        })
        // Age, rather than proximity or arrival order of this commit's children,
        // preserves the trunk when a topic branch reaches its shared ancestor.
        incoming.sort((a, b) => Number(b.owner === owner.get(commit.hash)) - Number(a.owner === owner.get(commit.hash)) || a.slot - b.slot || a.column - b.column)
        const column = incoming.length ? incoming[0].column : freeColumn()
        const slot = incoming.length ? incoming[0].slot : nextSlot++
        columnCount = Math.max(columnCount, column + 1)
        const point = { row, column }
        incoming.forEach(track => {
          track.edges.forEach(edge => { edge.to = point })
          tracks[track.column] = null
        })
        rows.push({ commit, column, slot })

        const seen = new Set()
        commit.parents.forEach((parent, parentIndex) => {
          if (seen.has(parent)) return
          seen.add(parent)
          const target = index.get(parent)
          // A filtered/shallow end is not an invented continuation. Only an
          // explicitly incomplete page reserves tracks for unloaded ancestors.
          if (target === undefined && !hasMore) return
          if (target !== undefined && target <= row) return
          const main = parentIndex === 0
          const waiting = []
          tracks.forEach((track, trackColumn) => {
            if (track !== null && track.parent === parent) waiting.push({ track, column: trackColumn })
          })
          waiting.sort((a, b) => a.track.slot - b.track.slot)
          // Every edge joining a rail turns INTO it immediately, so freeing its
          // old source column cannot create a hidden overlapping vertical line.
          // A first-parent spine is never sacrificed to an existing topic rail.
          const spine = owner.get(commit.hash)
          const continuesSpine = owner.get(parent) === spine
          const shared = main
            ? continuesSpine ? null : waiting.find(item => item.track.owner !== owner.get(parent))
            : waiting[0]
          const trackColumn = shared ? shared.column : main ? column : freeColumn()
          const trackSlot = shared ? shared.track.slot : main ? slot : nextSlot++
          const edge = { from: point, to: null, column: trackColumn, slot: trackSlot, main, parent }
          edges.push(edge)
          if (shared) {
            shared.track.edges.push(edge)
          } else {
            occupy(trackColumn, { parent, slot: trackSlot, owner: main ? spine : owner.get(parent), edges: [edge] })
          }
        })
        // A root without an incoming track may have occupied an appended column
        // only for its dot. Keep the free slot reusable by the next component.
        if (tracks[column] === undefined) tracks[column] = null
      })
      return { rows, edges, columnCount }
    }

    /**
     * A route has an independently reserved middle column. Extra-parent lines
     * leave at the merge child, while branch-source joins land at the ancestor
     * itself. Both bends fit inside the endpoint row, never half a history away.
     */
    function graphEdgePath(edge, rowCount, offsets = [], extraHeight = 0) {
      const x = column => LANE_X0 + column * LANE_W
      const y = row => row * ROW_H + ROW_H / 2 + (offsets[row] || 0)
      const x1 = x(edge.from.column)
      const y1 = y(edge.from.row)
      const trackX = x(edge.column)
      const x2 = edge.to === null ? trackX : x(edge.to.column)
      const y2 = edge.to === null ? rowCount * ROW_H + extraHeight : y(edge.to.row)
      const bend = Math.min(10, ROW_H * 0.4, Math.max(0, (y2 - y1) / 2))
      let path = `M ${x1} ${y1}`
      if (x1 !== trackX) {
        path += ` C ${x1} ${y1 + bend * 0.6} ${trackX} ${y1 + bend * 0.4} ${trackX} ${y1 + bend}`
      }
      if (trackX !== x2) {
        path += ` L ${trackX} ${y2 - bend}`
        path += ` C ${trackX} ${y2 - bend * 0.4} ${x2} ${y2 - bend * 0.6} ${x2} ${y2}`
      } else {
        path += ` L ${x2} ${y2}`
      }
      return path
    }
    // END GRAPH LAYOUT

    /**
     * The lane colour for one slot.
     *
     * @param slot - the lane's colour slot.
     * @returns the CSS colour.
     */
    function laneColor(slot) {
      return LANE_COLORS[Math.abs(slot) % LANE_COLORS.length]
    }

    /**
     * Classify a ref name into the badge it should wear.
     *
     * @param ref - the raw ref token from `git log --decorate`.
     * @returns the label, its kind, and whether HEAD points here.
     */
    function parseRef(ref, remotes) {
      const text = ref.trim()
      const isHead = text.startsWith('HEAD -> ')
      const name = isHead ? text.slice('HEAD -> '.length) : text
      // `HEAD` alone means a detached HEAD: there is no branch name to show, so
      // the badge says only that, rather than claiming a branch called HEAD.
      if (name === 'HEAD') return { label: 'HEAD', kind: 'detached', prefix: null, remote: null }
      if (isHead) return { label: name, kind: 'head', prefix: 'HEAD', remote: null }
      if (name.startsWith('tag: ')) return { label: name.slice(5), kind: 'tag', prefix: null, remote: null }
      // A remote-tracking name is `<remote>/<branch>`, and the remote names are
      // known, so the split is made against them rather than at the first slash:
      // `origin/feature/x` is remote `origin`, branch `feature/x`, not remote
      // `origin/feature`. Longest name first, so `my/remote` beats `my`.
      const ordered = [...(remotes ?? [])].sort((a, b) => b.length - a.length)
      for (const remote of ordered) {
        if (name.startsWith(`${remote}/`) && name.length > remote.length + 1) {
          return { label: name.slice(remote.length + 1), kind: 'remote', prefix: null, remote }
        }
      }
      return { label: name, kind: 'branch', prefix: null, remote: null }
    }

    /**
     * Fold a row's decoration into one badge per branch.
     *
     * Git reports a local branch and each remote-tracking branch as separate
     * tokens. Printing them all produces several pills that mostly repeat one
     * name — `main`, `origin/main`, `upstream/main` — and pushes the subject out
     * of the row. One badge per branch, naming its remotes, says the same thing
     * in the space of one.
     *
     * @param refs - the row's decoration tokens.
     * @returns one entry per distinct branch, tag or detached HEAD.
     */
    function groupRefs(refs, remotes) {
      const priority = { head: 0, branch: 1, remote: 2, tag: 3, detached: 4 }
      const seen = new Set()
      return refs.map(ref => {
        const parsed = parseRef(ref, remotes)
        const text = parsed.kind === 'remote' && parsed.remote ? `${parsed.remote}/${parsed.label}` : parsed.label
        return {
          key: `${parsed.kind}:${text}`,
          kind: parsed.kind,
          text,
          title: parsed.kind === 'head' ? `HEAD is at ${text}` : parsed.kind === 'tag' ? `tag ${text}` : text,
        }
      }).filter(ref => ref.text !== 'HEAD' || ref.kind !== 'remote')
        .filter(ref => seen.has(ref.key) ? false : (seen.add(ref.key), true))
        .sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9))
    }

    /**
     * Render the per-commit badges a graph row wears.
     *
     * @param refs - the row's already-grouped badges.
     * @returns the badge elements.
     */
    function RefBadges({ refs }) {
      if (refs.length === 0) return null
      return h('span', { className: 'gg-refs' }, refs.slice(0, 3).map(ref => h('span', {
        key: ref.key,
        className: `gg-ref gg-ref-${ref.kind}`,
        title: ref.title,
      }, h('span', { className: 'gg-ref-icon' }, h(GitIcon, { name: 'branch', size: 13 })), h('span', { className: 'gg-ref-name' }, ref.text))))
    }

    // BEGIN GRAPH CANVAS
    function GraphCanvas({ rows, edges, columnCount, height, expandedRow = -1, expandedHeight = 0 }) {
      const width = LANE_X0 * 2 + columnCount * LANE_W
      // The accordion occupies real row space. Keep the lane algorithm pure,
      // but shift endpoints below the open row so rails still meet their dots.
      const offsets = rows.map((_, row) => row > expandedRow ? expandedHeight : 0)
      const syntheticPath = rows[0]?.commit?.synthetic && rows.length > 1 ? h('path', {
        key: 'working-link', d: `M ${LANE_X0 + rows[0].column * LANE_W} ${ROW_H / 2} L ${LANE_X0 + rows[1].column * LANE_W} ${ROW_H + ROW_H / 2 + (offsets[1] || 0)}`,
        stroke: '#8b949e', strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', opacity: 0.85,
      }) : null
      const paths = [...(syntheticPath ? [syntheticPath] : []), ...edges.map((edge, i) => h('path', {
        key: `e${i}`,
        d: graphEdgePath(edge, rows.length, offsets, expandedRow >= 0 ? expandedHeight : 0),
        stroke: edge.from?.commit?.synthetic || rows[edge.from.row]?.commit?.synthetic
          ? '#8b949e' : laneColor(edge.slot),
        strokeWidth: edge.main ? 1.8 : 1.5,
        fill: 'none',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        opacity: edge.to === null ? 0.7 : 1,
      }))]
      const dots = rows.map((row, i) => {
        const merge = row.commit.parents.length > 1
        const color = row.commit.synthetic ? '#8b949e' : laneColor(row.slot)
        return h('circle', {
          key: `d${i}`,
          cx: LANE_X0 + row.column * LANE_W,
          cy: i * ROW_H + ROW_H / 2 + offsets[i],
          r: merge ? DOT_R : DOT_R - 0.5,
          fill: merge ? 'var(--dsw-alias-bg-base)' : color,
          stroke: color,
          strokeWidth: merge ? 1.8 : 0,
        })
      })
      return h('svg', {
        className: 'gg-canvas',
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        'aria-hidden': 'true',
      }, paths, dots)
    }
    // END GRAPH CANVAS

    /**
     * Render one commit row: its lane cell, its labels, and its metadata.
     *
     * The row reserves the graph's own width as a fixed indent. The graph is
     * drawn in one absolutely-positioned layer over the whole list, so a row
     * that did not reserve that space would put its text underneath the lanes —
     * which is exactly what makes a lane graph unreadable.
     *
     * Badges come before the subject rather than after it. A badge is short and
     * finite; a subject is the thing that gets long, so the subject is what
     * absorbs the shortage and ellipsizes. Metadata is the first thing dropped
     * when the column is narrow, because a truncated hash or a clipped date
     * tells a reader nothing while a truncated subject still does.
     *
     * @param props - the row, the indent, the selection state, and the actions.
     * @returns the row element.
     */
    function CommitRow({ row, indent, dense, remotes, selected, comparing, onSelect, onCompare, onContextMenu }) {
      const commit = row.commit
      const when = new Date(commit.authorDate)
      const stamp = Number.isNaN(when.getTime())
        ? commit.authorDate
        : when.toLocaleString(undefined, {
          year: '2-digit', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      const grouped = groupRefs(commit.refs, remotes)
      return h('div', {
        className: `gg-row${selected ? ' is-selected' : ''}${comparing ? ' is-comparing' : ''}`,
        role: 'button',
        'aria-pressed': selected,
        'aria-expanded': selected,
        'aria-controls': selected ? `gg-accordion-${commit.hash}` : undefined,
        tabIndex: selected ? 0 : -1,
        title: `${commit.hash}\n${commit.subject}\n${commit.authorName} — ${stamp}`,
        style: { '--gg-lane-width': `${indent}px`, '--gg-ref-color': commit.synthetic ? '#8b949e' : laneColor(row.slot) },
        onClick: (event) => {
          if (event.metaKey || event.ctrlKey) { onCompare(commit); return }
          onSelect(commit)
        },
        onContextMenu: (event) => {
          event.preventDefault()
          onContextMenu(event, commit)
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(commit)
          }
        },
      },
      h('span', { className: 'gg-row-body' },
        h('span', { className: 'gg-description' },
          grouped.length > 0 ? h(RefBadges, { refs: grouped }) : null,
          h('span', { className: 'gg-subject', title: commit.subject }, commit.subject)),
        h('span', { className: 'gg-row-meta' },
          h('span', { className: 'gg-author' }, commit.synthetic ? `${commit.count ?? 0} files` : commit.authorName),
          h('span', { className: 'gg-date' }, commit.synthetic ? '' : stamp),
          h('span', { className: 'gg-hash' }, commit.synthetic ? '' : commit.hash.slice(0, 8)))))
    }

    /** Resizable, keyboard-accessible panes; orientation follows available width. */
    function SplitPane({ first, second, axis = 'auto', initial = 38, label = 'Resize panes', breakpoint = 680 }) {
      const ref = React.useRef(null)
      const [wide, setWide] = React.useState(false)
      const [ratios, setRatios] = React.useState({ horizontal: initial, vertical: initial })
      React.useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= breakpoint))
        if (ref.current) observer.observe(ref.current)
        return () => observer.disconnect()
      }, [breakpoint])
      const horizontal = axis === 'horizontal' || (axis === 'auto' && wide)
      const direction = horizontal ? 'horizontal' : 'vertical'
      const ratio = ratios[direction]
      const change = value => setRatios(current => ({ ...current, [direction]: Math.max(18, Math.min(75, value)) }))
      return h('div', { ref, className: `gg-split gg-split-${direction}`, style: { '--gg-ratio': `${ratio}%` } },
        h('div', { className: 'gg-split-first' }, first),
        h('div', {
          className: 'gg-divider', role: 'separator', tabIndex: 0,
          'aria-label': label, 'aria-orientation': horizontal ? 'vertical' : 'horizontal',
          'aria-valuemin': 18, 'aria-valuemax': 75, 'aria-valuenow': Math.round(ratio),
          title: `${label} · Drag or use arrow keys · Double-click to reset`,
          onDoubleClick: () => change(initial),
          onKeyDown: event => {
            const backward = horizontal ? 'ArrowLeft' : 'ArrowUp'
            const forward = horizontal ? 'ArrowRight' : 'ArrowDown'
            if (event.key === backward || event.key === forward) {
              event.preventDefault(); change(ratio + (event.key === backward ? -3 : 3))
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault(); change(event.key === 'Home' ? 18 : 75)
            }
          },
          onPointerDown: event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) } },
          onPointerMove: event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const rect = ref.current.getBoundingClientRect()
            change(100 * (horizontal ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height))
          },
          onPointerUp: event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) },
        }),
        h('div', { className: 'gg-split-second' }, second))
    }

    /** Keep the active row visible after a pane resize without moving other panes. */
    function useRevealSelection(ref, selected, selector, sticky = false) {
      React.useEffect(() => {
        const container = ref.current
        if (!container) return
        const reveal = () => {
          const node = container.querySelector(selector)
          if (!node || container.clientHeight === 0) return
          const area = container.getBoundingClientRect(), row = node.getBoundingClientRect()
          const inset = sticky ? node.closest('.gg-du-group')?.querySelector('.gg-du-group-title')?.getBoundingClientRect().height || 0 : 0
          const top = area.top + inset
          if (row.top < top) container.scrollTop -= top - row.top
          else if (row.bottom > area.bottom) container.scrollTop += row.bottom - area.bottom
        }
        const observer = new ResizeObserver(reveal)
        observer.observe(container)
        reveal()
        return () => observer.disconnect()
      }, [ref, selected, selector, sticky])
    }

    /** One stable history browser. Selection updates the inspector, never a tab. */
    function LegacyGraphView({ tabInfo, sessionId }) {
      const signal = tabInfo.tab.signal
      const [state, setState] = React.useState({ commits: [], refs: null, exhausted: false, nextSkip: 0 })
      const [selected, setSelected] = React.useState(null)
      const [mode, setMode] = React.useState('history')
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [revision, setRevision] = React.useState(0)
      const [menu, setMenu] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const request = React.useRef(0)
      const noticeTimer = React.useRef(null)
      const graphRef = React.useRef(null)
      useRevealSelection(graphRef, selected, '.gg-row.is-selected')
      const load = React.useCallback(async (append = false) => {
        const id = ++request.current
        setBusy(true); setError(null)
        try {
          const result = await call({ op: 'commits', sessionId, skip: append ? state.nextSkip : 0, limit: append ? 120 : Math.max(120, Math.min(600, state.commits.length)) }, signal)
          while (!append && !result.exhausted && result.commits.length < state.commits.length) {
            if (request.current !== id || signal.aborted) return
            const page = await call({ op: 'commits', sessionId, skip: result.nextSkip, limit: Math.min(600, state.commits.length - result.commits.length) }, signal)
            result.commits.push(...page.commits)
            result.nextSkip = page.nextSkip
            result.exhausted = page.exhausted || page.commits.length === 0
          }
          if (request.current !== id || signal.aborted) return
          setState(current => ({ ...result, refs: result.refs ?? current.refs, commits: append ? [...current.commits, ...result.commits] : result.commits }))
          /* selection stays closed until the reader clicks a row */
        } catch (err) { if (request.current === id && err.name !== 'AbortError') setError(String(err.message ?? err)) }
        finally { if (request.current === id) setBusy(false) }
      }, [sessionId, signal, state.nextSkip, state.commits.length])
      React.useEffect(() => { load(); return () => { request.current += 1; clearTimeout(noticeTimer.current) } }, [sessionId, signal])
      const graph = React.useMemo(() => layout(state.commits, !state.exhausted), [state.commits, state.exhausted])
      const openCommit = commit => setSelected(commit.hash)
      const flash = text => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), 1800) }
      const history = h(SplitPane, {
        breakpoint: 1200, initial: 32, label: 'Resize history and commit details',
        first: h('section', { className: 'gg-root gg-history', 'aria-label': 'Commit history' },
          h('div', { className: 'gg-section-heading' }, h('span', null, 'COMMITS'), h('span', { className: 'gg-count' }, `${state.commits.length} loaded`)),
          error ? h('div', { className: 'gg-error', role: 'alert' }, error) : null,
          h('div', { ref: graphRef, className: 'gg-graph', 'aria-busy': busy,
            onKeyDown: event => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const index = state.commits.findIndex(commit => commit.hash === selected)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? state.commits.length - 1 : Math.max(0, Math.min(state.commits.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
              const commit = state.commits[next]
              if (commit) { setSelected(commit.hash); graphRef.current.querySelectorAll('.gg-row')[next]?.focus({ preventScroll: true }); graphRef.current.querySelectorAll('.gg-row')[next]?.scrollIntoView({ block: 'nearest' }) }
            },
          },
            h('div', { className: 'gg-graph-inner', style: { height: graph.rows.length * ROW_H } },
              h(GraphCanvas, { ...graph, height: graph.rows.length * ROW_H }),
              h('div', { className: 'gg-rows' }, graph.rows.map(row => h(CommitRow, {
                key: row.commit.hash, row, indent: LANE_X0 * 2 + graph.columnCount * LANE_W,
                dense: true, remotes: state.refs?.remotes ?? [], selected: selected === row.commit.hash,
                onSelect: openCommit, onCompare: openCommit,
                onContextMenu: (event, commit) => setMenu({ x: event.clientX, y: event.clientY, commit }),
              })))),
            busy ? h('div', { className: 'gg-history-status', role: 'status' }, h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }), h('span', null, state.commits.length ? 'Loading older history…' : 'Loading history…')) : null,
            !busy && !error && state.commits.length === 0 ? h('div', { className: 'gg-empty' }, 'No commits yet. Review uncommitted files in Changes.') : null,
            state.commits.length > 0 && !busy && !state.exhausted ? h('button', { className: 'gg-more-btn', onClick: () => load(true) }, 'Load older commits') : null)),
        second: selected ? h(CommitInspector, { hash: selected, sessionId, signal, revision, onSelect: setSelected }) : h('div', { className: 'gg-empty' }, 'Select a commit to inspect its changes.'),
      })
      return h('div', { className: 'gg-root gg-workbench' },
        h('div', { className: 'gg-toolbar' },
          h('div', { className: 'gg-modes', role: 'group', 'aria-label': 'Git view' }, ['history', 'changes'].map(value => h('button', {
            key: value, className: `gg-mode${mode === value ? ' is-active' : ''}`, 'aria-pressed': mode === value, onClick: () => setMode(value),
          }, value === 'history' ? 'History' : 'Changes'))),
          h('span', { className: 'gg-repo', title: state.refs?.head ?? '' }, state.refs?.head ?? 'Git'),
          h('span', { className: 'gg-readonly' }, 'Read-only'),
          h('button', { className: 'gg-icon-btn', 'aria-label': 'Refresh Git', title: 'Refresh history and working changes', disabled: busy, onClick: () => { load(); setRevision(value => value + 1) } }, h(GitIcon, { name: 'refresh' }))),
        notice ? h('div', { className: 'gg-notice', role: 'status' }, notice) : null,
        h('div', { className: 'gg-mode-content', hidden: mode !== 'history' }, history),
        h('div', { className: 'gg-mode-content', hidden: mode !== 'changes' }, h(ChangesView, { tabInfo, sessionId, revision })),
        menu ? h(ContextMenu, { menu, markers: [], onClose: () => setMenu(null), onOpenCommit: openCommit, onFlash: flash }) : null)
    }

    const ACCORDION_H = 248
    const ACCORDION_MIN_H = 180
    const ACCORDION_MAX_H = 720
    const ACCORDION_SPLIT = 50
    // The graph tab can unmount while a file's separate Diff tab is active.
    // Keep only the open row identity in plugin memory, scoped by DSH session;
    // this survives tab switches without leaking into browser-persistent storage.
    const openAccordionBySession = new Map()
    const accordionLayoutBySession = new Map()

    function AccordionSurface({ id, label, height, split, onHeightChange, onSplitChange, first, second, state = false, error = false }) {
      const ref = React.useRef(null)
      const resizeHeight = event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const rect = ref.current.getBoundingClientRect()
        onHeightChange(Math.max(ACCORDION_MIN_H, Math.min(ACCORDION_MAX_H, event.clientY - rect.top)))
      }
      const resizeSplit = event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const rect = ref.current.getBoundingClientRect()
        onSplitChange(Math.max(25, Math.min(75, 100 * (event.clientX - rect.left) / rect.width)))
      }
      const capture = event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) } }
      const release = event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }
      return h('div', { ref, id, className: `gg-accordion${state ? ` gg-accordion-state${error ? ' is-error' : ''}` : ''}`, role: state ? (error ? 'alert' : 'status') : undefined, 'aria-label': label,
        style: { '--gg-accordion-height': `${height}px`, '--gg-accordion-split': `${split}%` } },
        state ? h('div', { className: 'gg-accordion-state-content' }, first) : first,
        !state ? h('div', { className: 'gg-accordion-column-resizer', role: 'separator', tabIndex: 0, 'aria-label': 'Resize accordion columns', 'aria-orientation': 'vertical', 'aria-valuemin': 25, 'aria-valuemax': 75, 'aria-valuenow': Math.round(split),
          title: 'Drag to resize columns · Double-click to reset', onDoubleClick: () => onSplitChange(ACCORDION_SPLIT), onPointerDown: capture, onPointerMove: resizeSplit, onPointerUp: release, onPointerCancel: release,
          onKeyDown: event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onSplitChange(Math.max(25, Math.min(75, split + (event.key === 'ArrowLeft' ? -3 : 3)))) } } }) : null,
        state ? null : second,
        h('div', { className: 'gg-accordion-height-resizer', role: 'separator', tabIndex: 0, 'aria-label': 'Resize accordion height', 'aria-orientation': 'horizontal', 'aria-valuemin': ACCORDION_MIN_H, 'aria-valuemax': ACCORDION_MAX_H, 'aria-valuenow': Math.round(height),
          title: 'Drag down to resize accordion · Double-click to reset', onDoubleClick: () => onHeightChange(ACCORDION_H), onPointerDown: capture, onPointerMove: resizeHeight, onPointerUp: release, onPointerCancel: release,
          onKeyDown: event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onHeightChange(Math.max(ACCORDION_MIN_H, Math.min(ACCORDION_MAX_H, height + (event.key === 'ArrowUp' ? -20 : 20)))) } } }))
    }

    function CommitAccordion({ hash, sessionId, signal, revision = 0, onSelect, tabInfo, height, split, onHeightChange, onSplitChange }) {
      const [state, setState] = React.useState({ detail: null, error: null })
      React.useEffect(() => {
        let active = true
        setState(current => ({ detail: current.detail?.hash === hash ? current.detail : null, error: null }))
        call({ op: 'commit', sessionId, hash }, signal).then(result => { if (active) setState({ detail: result.detail, error: null }) })
          .catch(error => { if (active && error.name !== 'AbortError') setState({ detail: null, error: String(error.message ?? error) }) })
        return () => { active = false }
      }, [hash, sessionId, signal, revision])
      const detail = state.detail?.hash === hash ? state.detail : null
      if (state.error) return h(AccordionSurface, { id: `gg-accordion-${hash}`, label: 'Commit details unavailable', height, split, onHeightChange, onSplitChange, state: true, error: true,
        first: h(React.Fragment, null, h('strong', null, 'Unable to load commit details'), h('span', null, state.error)) })
      if (!detail) return h(AccordionSurface, { id: `gg-accordion-${hash}`, label: 'Loading commit details', height, split, onHeightChange, onSplitChange, state: true,
        first: h(React.Fragment, null, h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }), h('span', null, 'Loading commit details…')) })
      const openFile = file => openDiffTab(tabInfo, { mode: 'commits', base: detail.parents[0] ?? EMPTY_TREE, head: detail.hash, path: file.path, oldPath: file.oldPath })
      return h(AccordionSurface, { id: `gg-accordion-${hash}`, label: 'Commit details', height, split, onHeightChange, onSplitChange,
        first: h('section', { className: 'gg-accordion-meta' },
          h('dl', { className: 'gg-meta' },
            h('dt', null, 'Commit:'), h('dd', { className: 'gg-mono' }, detail.hash),
            h('dt', null, 'Parents:'), h('dd', null, detail.parents.length ? detail.parents.map(parent => h('button', { key: parent, className: 'gg-link', onClick: () => onSelect?.(parent) }, parent.slice(0, 16))).reduce((all, item, i) => i ? [...all, ' ', item] : [item], []) : 'None'),
            h('dt', null, 'Author:'), h('dd', null, `${detail.authorName} <${detail.authorEmail}>`),
            h('dt', null, 'Author Date:'), h('dd', null, formatDate(detail.authorDate)),
            h('dt', null, 'Committer:'), h('dd', null, `${detail.committerName} <${detail.committerEmail}>`),
            h('dt', null, 'Committer Date:'), h('dd', null, formatDate(detail.committerDate))),
          h('p', { className: 'gg-accordion-message' }, detail.message)),
        second: h('section', { className: 'gg-accordion-files' }, h(ChangedTree, { files: detail.files, onOpen: openFile })) })
    }

    function WorkingAccordion({ files = [], tabInfo, height, split, onHeightChange, onSplitChange }) {
      const openFile = file => openDiffTab(tabInfo, { mode: 'working', base: 'HEAD', head: '', path: file.path, oldPath: file.oldPath, group: file.group, staged: file.group === 'staged' })
      const groups = ['staged', 'unstaged', 'untracked']
      return h(AccordionSurface, { id: 'gg-accordion-WORKTREE', label: 'Uncommitted changes', height, split, onHeightChange, onSplitChange,
        first: h('section', { className: 'gg-accordion-meta' },
          h('dl', { className: 'gg-meta' }, h('dt', null, 'Status:'), h('dd', null, 'Uncommitted changes'), h('dt', null, 'Files:'), h('dd', null, files.length)),
          h('p', { className: 'gg-accordion-message' }, 'Read-only snapshot of staged, unstaged and untracked files.')),
        second: h('section', { className: 'gg-accordion-files gg-accordion-working' }, groups.map(group => {
          const entries = files.filter(file => file.group === group)
          if (!entries.length) return null
          return h('div', { key: group, className: 'gg-working-group' }, h('div', { className: 'gg-working-title' }, `${group[0].toUpperCase()}${group.slice(1)} (${entries.length})`), h(ChangedTree, { files: entries, onOpen: openFile }))
        })) })
    }

    /** Accordion history: full-width graph rows, with one row-local expansion. */
    function GraphView({ tabInfo, sessionId }) {
      const signal = tabInfo.tab.signal
      const [state, setState] = React.useState({ commits: [], refs: null, exhausted: false, nextSkip: 0 })
      const [working, setWorking] = React.useState({ files: [], error: null })
      const restoredAccordion = React.useRef(openAccordionBySession.get(sessionId))
      const restoredLayout = React.useRef(accordionLayoutBySession.get(sessionId) ?? { height: ACCORDION_H, split: ACCORDION_SPLIT })
      const [accordionHeight, setAccordionHeightState] = React.useState(restoredLayout.current.height)
      const [accordionSplit, setAccordionSplitState] = React.useState(restoredLayout.current.split)
      const setAccordionHeight = value => { const next = Math.max(ACCORDION_MIN_H, Math.min(ACCORDION_MAX_H, value)); accordionLayoutBySession.set(sessionId, { height: next, split: accordionSplit }); setAccordionHeightState(next) }
      const setAccordionSplit = value => { const next = Math.max(25, Math.min(75, value)); accordionLayoutBySession.set(sessionId, { height: accordionHeight, split: next }); setAccordionSplitState(next) }
      React.useEffect(() => { const next = accordionLayoutBySession.get(sessionId) ?? { height: ACCORDION_H, split: ACCORDION_SPLIT }; setAccordionHeightState(next.height); setAccordionSplitState(next.split) }, [sessionId])
      const restoreCount = React.useRef(Math.max(120, Math.min(600, restoredAccordion.current?.loadedCount ?? 0)))
      const [selected, setSelected] = React.useState(() => restoredAccordion.current?.hash ?? null)
      const selectAccordion = React.useCallback(value => {
        setSelected(current => {
          const next = typeof value === 'function' ? value(current) : value
          if (next === null) openAccordionBySession.delete(sessionId)
          else openAccordionBySession.set(sessionId, { hash: next, loadedCount: Math.max(state.commits.length, openAccordionBySession.get(sessionId)?.loadedCount ?? 0) })
          return next
        })
      }, [sessionId, state.commits.length])
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [revision, setRevision] = React.useState(0)
      const [menu, setMenu] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const request = React.useRef(0)
      const noticeTimer = React.useRef(null)
      const graphRef = React.useRef(null)
      const loadWorking = React.useCallback(() => call({ op: 'working', sessionId }, signal).then(result => {
        const files = ['staged', 'unstaged', 'untracked'].flatMap(group => (result[group] ?? []).map(entry => ({ ...entry, group, staged: group === 'staged' })))
        setWorking({ files, error: null }); return files
      }).catch(err => { if (err.name !== 'AbortError') setWorking(current => ({ ...current, error: String(err.message ?? err) })); return [] }), [sessionId, signal])
      const load = React.useCallback(async (append = false) => {
        const id = ++request.current
        setBusy(true); setError(null)
        try {
          const targetCount = append ? 120 : Math.max(120, Math.min(600, Math.max(state.commits.length, restoreCount.current)))
          const result = await call({ op: 'commits', sessionId, skip: append ? state.nextSkip : 0, limit: targetCount }, signal)
          if (request.current !== id || signal.aborted) return
          const loadedCount = append ? state.commits.length + result.commits.length : result.commits.length
          const saved = openAccordionBySession.get(sessionId)
          if (saved?.hash) openAccordionBySession.set(sessionId, { ...saved, loadedCount: Math.max(saved.loadedCount ?? 0, loadedCount) })
          restoreCount.current = Math.max(restoreCount.current, loadedCount)
          setState(current => ({ ...result, refs: result.refs ?? current.refs, commits: append ? [...current.commits, ...result.commits] : result.commits }))
          /* selection stays closed until the reader clicks a row */
        } catch (err) { if (request.current === id && err.name !== 'AbortError') setError(String(err.message ?? err)) }
        finally { if (request.current === id) setBusy(false) }
      }, [sessionId, signal, state.nextSkip, state.commits.length])
      React.useEffect(() => { load(); loadWorking(); return () => { request.current += 1; clearTimeout(noticeTimer.current) } }, [sessionId, signal])
      const workingCount = React.useMemo(() => new Set(working.files.map(file => file.path)).size, [working.files])
      const synthetic = React.useMemo(() => ({ hash: 'WORKTREE', parents: [], authorName: '', authorDate: '', refs: [], subject: `Uncommitted changes (${workingCount})`, synthetic: true, count: workingCount }), [workingCount])
      const commits = React.useMemo(() => workingCount > 0 ? [synthetic, ...state.commits] : state.commits, [workingCount, synthetic, state.commits])
      const graph = React.useMemo(() => layout(commits, !state.exhausted), [commits, state.exhausted])
      const selectedIndex = commits.findIndex(commit => commit.hash === selected)
      const expanded = selectedIndex >= 0
      const flash = text => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(null), 1800) }
      const toggle = commit => selectAccordion(current => current === commit.hash ? null : commit.hash)
      const laneWidth = Math.max(100, LANE_X0 * 2 + graph.columnCount * LANE_W)
      const rows = graph.rows.map((row, index) => h('div', { key: row.commit.hash, className: 'gg-row-stack' },
        h(CommitRow, { row, indent: laneWidth, dense: false, remotes: state.refs?.remotes ?? [], selected: selected === row.commit.hash,
          onSelect: toggle, onCompare: toggle, onContextMenu: (event, commit) => setMenu({ x: event.clientX, y: event.clientY, commit }) }),
        selected === row.commit.hash ? (row.commit.synthetic ? h(WorkingAccordion, { files: working.files, tabInfo, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit }) : h(CommitAccordion, { hash: row.commit.hash, sessionId, signal, revision, tabInfo, onSelect: selectAccordion, height: accordionHeight, split: accordionSplit, onHeightChange: setAccordionHeight, onSplitChange: setAccordionSplit })) : null))
      const totalHeight = graph.rows.length * ROW_H + (expanded ? accordionHeight : 0)
      return h('div', { className: 'gg-root gg-workbench' },
        notice ? h('div', { className: 'gg-notice', role: 'status' }, notice) : null,
        h('section', { className: 'gg-root gg-history', style: { '--gg-lane-width': `${laneWidth}px` }, 'aria-label': 'Commit history' },
          h('div', { className: 'gg-section-heading gg-column-heading' },
            h('span', null, h('button', { className: 'gg-column-refresh', 'aria-label': 'Refresh Git', title: 'Refresh history and working changes', disabled: busy, onClick: () => { load(); loadWorking(); setRevision(value => value + 1) } }, 'Graph')),
            h('span', null, 'Description'), h('span', null, 'Date'), h('span', null, 'Author'), h('span', null, 'Commit')),
          error ? h('div', { className: 'gg-error', role: 'alert' }, error) : null,
          h('div', { ref: graphRef, className: 'gg-graph', style: { '--gg-lane-width': `${laneWidth}px` }, 'aria-busy': busy, onKeyDown: event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
            event.preventDefault(); const index = selectedIndex < 0 ? 0 : selectedIndex; const next = event.key === 'Home' ? 0 : event.key === 'End' ? commits.length - 1 : Math.max(0, Math.min(commits.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))); const commit = commits[next]
            if (commit) { toggle(commit); graphRef.current.querySelectorAll('.gg-row')[next]?.focus({ preventScroll: true }); graphRef.current.querySelectorAll('.gg-row')[next]?.scrollIntoView({ block: 'nearest' }) }
          } }, h('div', { className: 'gg-graph-inner', style: { height: totalHeight } }, h(GraphCanvas, { ...graph, height: totalHeight, expandedRow: expanded ? selectedIndex : -1, expandedHeight: expanded ? accordionHeight : 0 }), h('div', { className: 'gg-rows' }, rows)),
          busy ? h('div', { className: 'gg-history-status', role: 'status' }, h('span', { className: 'gg-spinner', 'aria-hidden': 'true' }), h('span', null, state.commits.length ? 'Loading older history…' : 'Loading history…')) : null,
          !busy && !error && !state.commits.length ? h('div', { className: 'gg-empty' }, 'No commits yet. Review uncommitted files above.') : null,
          state.commits.length > 0 && !busy && !state.exhausted ? h('button', { className: 'gg-more-btn', onClick: () => load(true) }, 'Load older commits') : null),
        menu ? h(ContextMenu, { menu, markers: [], onClose: () => setMenu(null), onOpenCommit: toggle, onFlash: flash }) : null))
    }

    function CommitInspector({ hash, sessionId, signal, revision = 0, onSelect, tabInfo }) {
      const [state, setState] = React.useState({ detail: null, error: null })
      React.useEffect(() => {
        let active = true
        setState(current => ({ detail: current.detail?.hash === hash ? current.detail : null, error: null }))
        call({ op: 'commit', sessionId, hash }, signal).then(result => { if (active) setState({ detail: result.detail, error: null }) })
          .catch(error => { if (active && error.name !== 'AbortError') setState({ detail: null, error: String(error.message ?? error) }) })
        return () => { active = false }
      }, [hash, sessionId, signal, revision])
      const detail = state.detail?.hash === hash ? state.detail : null
      if (state.error) return h('div', { className: 'gg-error', role: 'alert' }, state.error)
      if (!detail) return h('div', { className: 'gg-empty', role: 'status' }, 'Loading commit…')
      return h('section', { className: 'gg-root gg-inspector', 'aria-label': 'Commit details' },
        h('details', { className: 'gg-commit-summary' },
          h('summary', { title: detail.message }, h('span', { className: 'gg-commit-subject' }, detail.message.split('\n')[0]),
            h('span', { className: 'gg-commit-caption' }, `${hash.slice(0, 8)} · ${detail.authorName} · ${formatDate(detail.authorDate)}`)),
          h('div', { className: 'gg-commit-extra' }, h('p', { className: 'gg-msg' }, detail.message),
            h('div', null, `${detail.authorName} <${detail.authorEmail}>`),
            h('button', { className: 'gg-link', onClick: () => copyText(hash) }, 'Copy commit hash'),
            detail.parents.length > 0 ? h('div', null, 'Parents: ', detail.parents.map(parent => h('button', { key: parent, className: 'gg-link', onClick: () => onSelect?.(parent) }, `${parent.slice(0, 8)} `))) : null)),
        h('div', { className: 'gg-diff-summary' }, `${detail.files.length} changed files · ${detail.parents.length > 1 ? 'Merge · compared with first parent' : detail.parents.length ? 'Compared with parent' : 'Root commit · all added files'}`),
        h(FileWorkspace, { files: detail.files, sessionId, signal, base: detail.parents[0] ?? EMPTY_TREE, head: detail.hash, revision, tabInfo }))
    }

    /** Legacy commit links use the same persistent file/diff browser. */
    function CommitView({ tabInfo, sessionId }) {
      const initial = tabInfo.tab.navigation?.params?.hash
      const [hash, setHash] = React.useState(initial)
      React.useEffect(() => setHash(initial), [initial])
      return hash ? h(CommitInspector, { hash, sessionId, signal: tabInfo.tab.signal, onSelect: setHash, tabInfo }) : h('div', { className: 'gg-empty' }, 'No commit selected.')
    }

    function DiffView({ tabInfo, sessionId }) {
      return h(DiffPanel, { sessionId, signal: tabInfo.tab.signal, params: tabInfo.tab.navigation?.params ?? {} })
    }

    function ChangesView({ tabInfo, sessionId, revision = 0 }) {
      const signal = tabInfo.tab.signal
      const [state, setState] = React.useState({ files: [], busy: true, error: null, readAt: null })
      const [refresh, setRefresh] = React.useState(0)
      React.useEffect(() => {
        let active = true
        setState(current => ({ ...current, busy: true, error: null }))
        call({ op: 'working', sessionId }, signal).then(result => {
          if (!active) return
          const files = ['staged', 'unstaged', 'untracked'].flatMap(group => (result[group] ?? []).map(entry => ({ ...entry, group, staged: group === 'staged' })))
          setState({ files, busy: false, error: null, readAt: new Date() })
        }).catch(error => { if (active && error.name !== 'AbortError') setState(current => ({ ...current, busy: false, error: String(error.message ?? error) })) })
        return () => { active = false }
      }, [sessionId, signal, revision, refresh])
      const readAt = formatTime(state.readAt)
      return h('section', { className: 'gg-root', 'aria-label': 'Working changes' },
        h('div', { className: 'gg-toolbar' }, h('span', { className: 'gg-repo' }, 'Working changes'),
          h('span', { className: 'gg-count' }, `${state.files.length} files`),
          h('button', { className: 'gg-icon-btn', 'aria-label': 'Refresh changes', disabled: state.busy, onClick: () => setRefresh(value => value + 1) }, h(GitIcon, { name: 'refresh' }))),
        h('div', { className: 'gg-diff-summary', role: 'status' }, state.busy ? 'Reading working tree…' : readAt === null ? 'Snapshot unavailable' : `Snapshot ${readAt} · refresh to see the agent’s latest edits`),
        state.error ? h('div', { className: 'gg-error', role: 'alert' }, state.error) : null,
        !state.busy && !state.error && state.files.length === 0 ? h('div', { className: 'gg-empty' }, 'Working tree clean. No uncommitted changes.') : null,
        h(FileWorkspace, { files: state.files, mode: 'working', sessionId, signal, tabInfo, revision: revision + refresh }))
    }

    // Insert inside the existing factory; requires React, h, call, GitIcon and SplitPane.
    // BEGIN DIFF UI PURE HELPERS
    /** Parse ordinary unified patches without treating +++/--- content as headers. */
    function parseUnifiedPatch(patch) {
      const lines = String(patch ?? '').split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      const rows = [], hunks = []
      let oldLine = 0, newLine = 0, oldLeft = 0, newLeft = 0
      let additions = 0, deletions = 0, binary = false
      for (const text of lines) {
        const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text)
        const row = { text, kind: 'meta', old: null, new: null }
        if (match) {
          oldLine = Number(match[1]); newLine = Number(match[3])
          oldLeft = Number(match[2] ?? 1); newLeft = Number(match[4] ?? 1)
          row.kind = 'hunk'; row.hunk = hunks.length
          hunks.push(rows.length)
        } else if (text.startsWith('\\')) {
          row.kind = 'note'
        } else if (oldLeft > 0 && text.startsWith('-')) {
          row.kind = 'del'; row.old = oldLine++; oldLeft--; deletions++
        } else if (newLeft > 0 && text.startsWith('+')) {
          row.kind = 'add'; row.new = newLine++; newLeft--; additions++
        } else if (oldLeft > 0 && newLeft > 0 && text.startsWith(' ')) {
          row.kind = 'ctx'; row.old = oldLine++; row.new = newLine++
          oldLeft--; newLeft--
        } else {
          oldLeft = 0; newLeft = 0
          if (/^(Binary files .* differ|GIT binary patch)/.test(text)) binary = true
        }
        rows.push(row)
      }
      return { rows, hunks, additions, deletions, binary }
    }

    /**
     * Align a unified patch into rows suitable for a side-by-side preview.
     * Context remains paired; adjacent delete/add runs become replacement rows,
     * with null cells when one side is longer. Hunk and note rows span both
     * sides so navigation and no-newline markers remain understandable.
     */
    function planSplitRows(rows = []) {
      const planned = []
      const cell = (row, index) => row ? { text: row.text, number: row.old ?? row.new ?? null, row, index } : null
      for (let i = 0; i < rows.length;) {
        const row = rows[i]
        if (row.kind === 'meta') { i++; continue }
        if (row.kind === 'hunk') {
          planned.push({ kind: 'hunk', row, index: i })
          i++
          continue
        }
        if (row.kind === 'note') {
          planned.push({ kind: 'note', row, index: i })
          i++
          continue
        }
        if (row.kind === 'ctx') {
          planned.push({ kind: 'line', old: cell(row, i), new: cell(row, i), indices: [i] })
          i++
          continue
        }
        if (row.kind === 'del' || row.kind === 'add') {
          const start = i
          const deletes = [], adds = []
          while (i < rows.length && (rows[i].kind === 'del' || rows[i].kind === 'add')) {
            const current = rows[i]
            ;(current.kind === 'del' ? deletes : adds).push(cell(current, i))
            i++
          }
          const count = Math.max(deletes.length, adds.length)
          for (let offset = 0; offset < count; offset++) {
            const old = deletes[offset] || null
            const newer = adds[offset] || null
            planned.push({ kind: 'line', old, new: newer, indices: [old?.index, newer?.index].filter(index => index != null), replacement: !!old && !!newer })
          }
          // Defensive progress guarantee if a future row kind is introduced.
          if (i === start) i++
          continue
        }
        planned.push({ kind: 'line', old: cell(row, i), new: null, indices: [i] })
        i++
      }
      return planned
    }

    /** Auto keeps the established unified view until a real width is measured. */
    function resolveDiffLayout(mode = 'auto', width = null, splitAt = 900) {
      const normalized = mode === 'split' || mode === 'unified' ? mode : 'auto'
      if (normalized !== 'auto') return normalized
      return Number.isFinite(width) && width >= splitAt ? 'split' : 'unified'
    }

    /** Group is part of identity: the same path can be staged AND unstaged. */
    function diffFileIdentity(file, mode = 'commits') {
      const group = mode === 'working'
        ? (file.group || (file.staged ? 'staged' : file.status === '?' ? 'untracked' : 'unstaged'))
        : 'commits'
      return JSON.stringify([group, file.path])
    }
    // END DIFF UI PURE HELPERS

    /** Compact themed dropdown used by the diff toolbar instead of a native select. */
    function CompactDropdown({ value, options, onChange, label, title, className = '' }) {
      const [open, setOpen] = React.useState(false)
      const root = React.useRef(null)
      const selected = options.find(option => option.value === value) ?? options[0]
      React.useEffect(() => {
        if (!open) return undefined
        const closeOutside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
        const closeEscape = event => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeEscape)
        return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
      }, [open])
      const choose = next => { onChange(next); setOpen(false) }
      const move = delta => {
        const index = Math.max(0, options.findIndex(option => option.value === value))
        choose(options[(index + delta + options.length) % options.length].value)
      }
      return h('div', { ref: root, className: `gg-du-dropdown ${className}${open ? ' is-open' : ''}` },
        h('button', { type: 'button', className: 'gg-du-dropdown-trigger', 'aria-label': label, 'aria-haspopup': 'listbox', 'aria-expanded': open, title,
          onClick: () => setOpen(current => !current), onKeyDown: event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
            else if (event.key === 'Escape') setOpen(false)
          } }, h('span', null, selected?.label ?? value), h('span', { className: 'gg-du-dropdown-chevron', 'aria-hidden': 'true' }, '⌄')),
        open ? h('div', { className: 'gg-du-dropdown-menu', role: 'listbox', 'aria-label': label }, options.map(option => h('button', {
          key: option.value, type: 'button', role: 'option', className: `gg-du-dropdown-option${option.value === value ? ' is-selected' : ''}`, 'aria-selected': option.value === value,
          onClick: () => choose(option.value),
        }, h('span', { className: 'gg-du-dropdown-check', 'aria-hidden': 'true' }, option.value === value ? '✓' : ''), h('span', null, option.label)))) : null)
    }

    /** Shared inline or standalone diff. Optional params.group identifies untracked files. */
    function DiffPanel({ sessionId, signal, params = {}, revision = 0 }) {
      const [wrap, setWrap] = React.useState(true)
      const [context, setContext] = React.useState(3)
      const [syntax, setSyntax] = React.useState(true)
      const [layoutMode, setLayoutMode] = React.useState('auto')
      const [paneWidth, setPaneWidth] = React.useState(null)
      const [retry, setRetry] = React.useState(0)
      const [state, setState] = React.useState({ key: '', status: 'loading' })
      const [hunk, setHunk] = React.useState(-1)
      const hunkNodes = React.useRef([])
      const scroll = React.useRef(null)
      const panelRef = React.useRef(null)
      const mode = params.mode === 'working' ? 'working' : 'commits'
      const path = typeof params.path === 'string' ? params.path : ''
      const oldPath = typeof params.oldPath === 'string' ? params.oldPath : undefined
      const untracked = mode === 'working' && params.group === 'untracked'
      const staged = params.staged === true
      const key = JSON.stringify([sessionId, mode, path, oldPath, params.base, params.head, staged, untracked, context, revision, retry])
      React.useEffect(() => {
        const controller = new AbortController()
        let active = true
        const abort = () => controller.abort()
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) controller.abort()
        setHunk(-1)
        hunkNodes.current = []
        if (scroll.current) scroll.current.scrollTop = 0
        setState({ key, status: controller.signal.aborted ? 'cancelled' : 'loading' })
        const cleanup = () => { active = false; controller.abort(); signal?.removeEventListener('abort', abort) }
        if (untracked || !path || controller.signal.aborted) return cleanup
        const request = mode === 'working'
          ? { op: 'workingDiff', sessionId, path, oldPath, staged, context }
          : { op: 'diff', sessionId, from: params.base, to: params.head, path, oldPath, context }
        call(request, controller.signal).then(result => {
          if (active && !controller.signal.aborted) setState({ key, status: 'ready', patch: String(result.patch ?? ''), truncated: result.truncated === true })
        }).catch(error => {
          if (!active) return
          setState({ key, status: controller.signal.aborted || error.name === 'AbortError' ? 'cancelled' : 'error', error: String(error.message ?? error) })
        })
        return cleanup
      }, [key, signal])
      React.useEffect(() => {
        const node = panelRef.current
        if (!node || typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(entries => {
          const width = entries[0]?.contentRect?.width
          if (Number.isFinite(width)) setPaneWidth(width)
        })
        observer.observe(node)
        return () => observer.disconnect()
      }, [])
      const current = state.key === key ? state : { status: 'loading' }
      const layout = resolveDiffLayout(layoutMode, paneWidth)
      const parsed = React.useMemo(() => parseUnifiedPatch(current.patch), [current.patch])
      const splitRows = React.useMemo(() => planSplitRows(parsed.rows), [parsed.rows])
      // Bound browser node creation even for a patch made of extremely short lines.
      const visibleRows = parsed.rows.slice(0, 12000)
      const language = GitSyntax.languageForPath(path)
      const languageLabel = language ? ({ javascript: 'JS', typescript: 'TS', python: 'PY', markdown: 'MD', json: 'JSON', css: 'CSS', html: 'HTML' }[language] || language.toUpperCase().slice(0, 4)) : 'TXT'
      const highlights = React.useMemo(() => GitSyntax.highlightRows(parsed.rows.slice(0, 12000), path, syntax), [parsed, path, syntax])
      const visibleHunks = parsed.hunks.filter(index => index < visibleRows.length)
      const metadata = parsed.rows.filter(row => row.kind === 'meta').map(row => row.text).join('\n')
      const cut = current.truncated || parsed.rows.length > visibleRows.length
      const jump = delta => {
        const next = Math.max(0, Math.min(visibleHunks.length - 1, hunk + delta))
        setHunk(next)
        const node = hunkNodes.current[next]
        if (node && scroll.current) scroll.current.scrollTop += node.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top
      }
      const title = oldPath && oldPath !== path ? `${oldPath} → ${path}` : path
      const highlightedCode = row => {
        if (!row) return h('span', { className: 'gg-du-code gg-du-code-empty' }, '\u00a0')
        const tokens = highlights?.get(row.index)
        return h('span', { className: 'gg-du-code' }, row.text[0], tokens
          ? tokens.map((token, j) => h('span', { key: j, className: token.classes || undefined }, token.text))
          : row.text.slice(1) || '\u00a0')
      }
      const splitCell = (side, cell) => h('div', { className: `gg-du-side gg-du-${side}${cell ? ` gg-du-${cell.row.kind}` : ' is-empty'}` },
        h('span', { className: 'gg-du-number', 'aria-label': cell?.number == null ? undefined : `${side === 'old' ? 'Old' : 'New'} line ${cell.number}` }, cell?.number ?? null),
        highlightedCode(cell))
      const splitPatch = h('div', { className: `gg-du-patch gg-du-split${wrap ? ' is-wrapped' : ''}`, 'aria-label': 'Split diff' }, splitRows.slice(0, 12000).map((item, i) => {
        if (item.kind === 'hunk') return h('div', { key: `h${i}`, className: `gg-du-split-hunk${item.row.hunk === hunk ? ' is-current' : ''}`, ref: node => { hunkNodes.current[item.row.hunk] = node } }, item.row.text)
        if (item.kind === 'note') return h('div', { key: `n${i}`, className: 'gg-du-split-note' }, item.row.text)
        return h('div', { key: `l${i}`, className: `gg-du-split-row gg-du-${item.replacement ? 'replacement' : 'line'}` }, splitCell('old', item.old), splitCell('new', item.new))
      }))
      const unifiedPatch = h('div', { className: `gg-du-patch${wrap ? ' is-wrapped' : ''}`, 'aria-label': 'Unified diff' }, visibleRows.map((row, i) => row.kind === 'meta' ? null : h('div', {
        key: i, className: `gg-du-line gg-du-${row.kind}${row.hunk === hunk ? ' is-current' : ''}`,
        ref: row.kind === 'hunk' ? node => { hunkNodes.current[row.hunk] = node } : undefined,
      }, h('span', { className: 'gg-du-number', 'aria-label': row.old === null ? undefined : `Old line ${row.old}` }, row.old),
      h('span', { className: 'gg-du-number', 'aria-label': row.new === null ? undefined : `New line ${row.new}` }, row.new),
      h('span', { className: 'gg-du-code' }, highlights?.has(i)
        ? [row.text[0], ...highlights.get(i).map((token, j) => h('span', { key: j, className: token.classes || undefined }, token.text))]
        : row.text || '\u00a0'))))
      let body
      if (!path) body = h('div', { className: 'gg-empty' }, 'Select a file to inspect its changes.')
      else if (untracked) body = h('div', { className: 'gg-empty' }, 'Untracked file. Content preview is not available from the current Git host; this file is not included in git diff.')
      else if (current.status === 'loading') body = h('div', { className: 'gg-empty', role: 'status' }, 'Loading diff…')
      else if (current.status === 'cancelled') body = h('div', { className: 'gg-empty', role: 'status' }, 'Diff request cancelled.')
      else if (current.status === 'error') body = h('div', { className: 'gg-error', role: 'alert' }, current.error,
        h('button', { type: 'button', className: 'gg-du-button', onClick: () => setRetry(value => value + 1) }, 'Retry'))
      else body = h(React.Fragment, null,
        parsed.binary ? h('div', { className: 'gg-du-message' }, 'Binary file changed — no textual preview.') : null,
        !parsed.rows.length ? h('div', { className: 'gg-empty' }, 'No textual changes. The file may have changed since this list was read.') : null,
        parsed.rows.length > 0 && !parsed.hunks.length && !parsed.binary ? h('div', { className: 'gg-du-message' }, 'Metadata-only change (for example a rename or file mode change).') : null,
        layout === 'split' ? splitPatch : unifiedPatch,
        cut ? h('div', { className: 'gg-du-message', role: 'status' }, 'Partial diff: output reached the host or display limit. Counts describe only the returned patch.') : null)
      return h('section', { ref: panelRef, className: 'gg-du-panel', 'aria-label': title ? `Diff for ${title}` : 'Diff preview' },
        h('div', { className: 'gg-du-title', title }, title || 'Diff preview'),
        h('div', { className: 'gg-du-controls' },
          h('button', { type: 'button', className: 'gg-du-button gg-du-icon-button', 'aria-label': 'Toggle word wrap', title: wrap ? 'Disable word wrap' : 'Enable word wrap', 'aria-pressed': wrap, onClick: () => setWrap(value => !value) }, h(GitIcon, { name: 'wrap', size: 14 })),
          h(CompactDropdown, { className: 'gg-du-layout-select', value: layoutMode, onChange: setLayoutMode, label: 'Diff layout', title: 'Diff layout', options: [{ value: 'auto', label: 'Auto view' }, { value: 'split', label: 'Side by side' }, { value: 'unified', label: 'Inline' }] }),
          h('button', { type: 'button', className: 'gg-du-button gg-du-language', disabled: !language, 'aria-label': 'Syntax highlighting', 'aria-pressed': syntax && !!highlights,
            title: !language ? 'Plain text: unsupported file type' : highlights ? `${language} highlighting — shown diff context only` : 'Highlighting off or diff exceeds the 200 KB / 5,000 line limit', onClick: () => setSyntax(value => !value) }, languageLabel),
          h(CompactDropdown, { className: 'gg-du-context-select', value: context, onChange: setContext, label: 'Context lines', title: 'Unchanged lines shown around each change', options: [0, 3, 10, 25, 50, 100].map(value => ({ value, label: `Context: ${value}` })) }),
          h('span', { className: 'gg-du-counts', title: cut ? 'Counts in returned partial patch' : 'Changed lines' },
            h('span', { className: 'gg-du-added' }, `+${parsed.additions}`), ' ', h('span', { className: 'gg-du-deleted' }, `−${parsed.deletions}`)),
          h('button', { type: 'button', className: 'gg-du-button gg-du-icon-button', disabled: hunk <= 0, onClick: () => jump(-1), 'aria-label': 'Previous hunk', title: 'Previous change' }, '↑'),
          h('button', { type: 'button', className: 'gg-du-button gg-du-icon-button', disabled: !visibleHunks.length || hunk >= visibleHunks.length - 1, onClick: () => jump(1), 'aria-label': 'Next hunk', title: 'Next change' }, '↓'),
          visibleHunks.length ? h('span', { className: 'gg-du-position', title: 'Current change' }, `${hunk + 1}/${visibleHunks.length}`) : null),
        h('div', { className: 'gg-du-summary' }, mode === 'working' ? (untracked ? 'Untracked' : staged ? 'Staged · HEAD → index' : 'Unstaged · index → working tree') : `${String(params.base ?? '').slice(0, 10)} → ${String(params.head ?? '').slice(0, 10)}`),
        metadata ? h('details', { className: 'gg-du-metadata', key },
          h('summary', null, 'Diff metadata'), h('pre', null, metadata)) : null,
        h('div', { ref: scroll, className: 'gg-du-scroll', tabIndex: 0, 'aria-label': 'Scrollable diff', 'aria-busy': !untracked && !!path && current.status === 'loading' }, body))
    }

    /** Open every changed file in a fresh right-sidebar diff tab. */
    function openDiffTab(tabInfo, params) {
      const openTab = tabInfo?.tab?.actions?.openTab
      if (typeof openTab !== 'function') return false
      tabInfo.tab.actions.openTab(DIFF_KIND, { params })
      return true
    }

    /** Build a stable, always-expanded folder tree from repository-relative paths. */
    function makeFileTree(files = []) {
      const root = { name: '', folders: new Map(), files: [] }
      for (const file of files) {
        const path = String(file.path ?? '')
        if (!path) continue
        const parts = path.split('/').filter(Boolean)
        let node = root
        parts.slice(0, -1).forEach(name => {
          if (!node.folders.has(name)) node.folders.set(name, { name, folders: new Map(), files: [] })
          node = node.folders.get(name)
        })
        node.files.push({ ...file, path })
      }
      return root
    }

    function compactTreeFolder(folder) {
      let node = folder
      const names = [node.name]
      while (node.files.length === 0 && node.folders.size === 1) {
        node = [...node.folders.values()][0]
        names.push(node.name)
      }
      return { node, name: names.join('/') }
    }

    function fileStatus(file) {
      const code = String(file.status || '?')[0].toUpperCase()
      return { code, title: ({ M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Unmerged', '?': 'Untracked' })[code] || file.status || 'Changed' }
    }

    function changeCounts(file) {
      const added = file.added ?? file.additions ?? file.insertions
      const removed = file.removed ?? file.deletions ?? file.deletionsCount
      return Number.isFinite(Number(added)) || Number.isFinite(Number(removed))
        ? h('span', { className: 'gg-file-counts' }, Number.isFinite(Number(added)) ? h('span', { className: 'gg-file-added' }, `+${Number(added)}`) : null, ' ', Number.isFinite(Number(removed)) ? h('span', { className: 'gg-file-removed' }, `−${Number(removed)}`) : null)
        : null
    }

    function FileIcon({ path = '', folder = false }) {
      const extension = folder ? 'folder' : (String(path).split('.').pop()?.toLowerCase() || 'file')
      return h('svg', { className: `gg-file-icon gg-file-icon-${extension}`, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, folder
        ? h('path', { d: 'M1.5 3.5h5l1.35 1.5h6.65v8.5h-13z' })
        : h(React.Fragment, null, h('path', { d: 'M3 1.5h6.5l3.5 3.5v9.5H3z' }), h('path', { className: 'gg-file-icon-fold', d: 'M9.5 1.5V5H13' })))
    }

    function ChangedTree({ files = [], onOpen, empty = 'No changed files.' }) {
      const tree = React.useMemo(() => makeFileTree(files), [files])
      const renderNode = (node, prefix = '') => {
        const folders = [...node.folders.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        const entries = [...node.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
        return [...folders.map(folder => {
          const compact = compactTreeFolder(folder)
          return h('div', { key: `${prefix}${compact.name}/`, className: 'gg-tree-folder' },
            h('div', { className: 'gg-tree-folder-name', title: `${prefix}${compact.name}/` }, h('span', { className: 'gg-tree-chevron' }, '▾'), h(FileIcon, { path: compact.name, folder: true }), h('span', null, compact.name)),
            h('div', { className: 'gg-tree-children' }, renderNode(compact.node, `${prefix}${compact.name}/`)))
        }),
        ...entries.map(file => {
          const status = fileStatus(file)
          const title = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
          return h('button', { key: `${prefix}${file.path}:${file.group || ''}`, type: 'button', className: 'gg-file gg-tree-file', title,
            'data-status': status.code, onClick: () => onOpen?.(file),
          }, h(FileIcon, { path: file.path }), h('span', { className: 'gg-sr-only' }, `${status.title}: `),
          h('span', { className: 'gg-path' }, file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path), changeCounts(file))
        })]
      }
      const children = renderNode(tree)
      return h('div', { className: 'gg-tree', role: 'tree' }, children.length ? children : h('div', { className: 'gg-empty' }, empty))
    }

    /** Files are flat entries {path, oldPath?, status, group?, staged?}; tabs are preferred. */
    function FileWorkspace({ files = [], sessionId, signal, base, head, mode = 'commits', revision = 0, tabInfo }) {
      const [filter, setFilter] = React.useState('')
      const [selection, setSelection] = React.useState(null)
      const rows = React.useRef(new Map())
      const listRef = React.useRef(null)
      const scope = JSON.stringify([sessionId, mode, base, head])
      const normalized = files.map(file => ({ ...file, group: mode === 'working' ? (file.group || (file.staged ? 'staged' : file.status === '?' ? 'untracked' : 'unstaged')) : 'commits' }))
      const query = filter.trim().toLocaleLowerCase()
      const order = ['staged', 'unstaged', 'untracked']
      const visible = normalized.filter(file => `${file.path}\n${file.oldPath || ''}`.toLocaleLowerCase().includes(query))
        .sort((a, b) => mode === 'working' ? order.indexOf(a.group) - order.indexOf(b.group) : 0)
      const picked = selection?.scope === scope ? visible.find(file => diffFileIdentity(file, mode) === selection.id) : null
      const selected = picked || visible[0] || null
      const selectedId = selected ? diffFileIdentity(selected, mode) : null
      useRevealSelection(listRef, `${scope}:${selectedId}`, '.gg-du-file.is-selected', true)
      const index = selected ? visible.findIndex(file => diffFileIdentity(file, mode) === selectedId) : -1
      React.useEffect(() => {
        if (selectedId !== null && (selection?.scope !== scope || selection?.id !== selectedId)) setSelection({ scope, id: selectedId })
      }, [scope, selectedId, selection])
      const pick = (file, focus) => {
        if (tabInfo) openDiffTab(tabInfo, mode === 'working'
          ? { mode: 'working', base: 'HEAD', head: '', path: file.path, oldPath: file.oldPath, group: file.group, staged: file.group === 'staged' }
          : { mode: 'commits', base, head, path: file.path, oldPath: file.oldPath })
        const id = diffFileIdentity(file, mode)
        setSelection({ scope, id })
        if (focus) { const node = rows.current.get(id); node?.focus(); node?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
      }
      const move = delta => { if (visible.length) pick(visible[Math.max(0, Math.min(visible.length - 1, index + delta))], true) }
      const groups = mode === 'working' ? [['staged', 'Staged'], ['unstaged', 'Unstaged'], ['untracked', 'Untracked']] : [['commits', 'Changed files']]
      const first = h('section', { className: 'gg-du-filepane', 'aria-label': 'Changed files' },
        h('div', { className: 'gg-du-filter' }, h('input', { type: 'search', placeholder: 'Filter files…', 'aria-label': 'Filter files', value: filter, onChange: event => setFilter(event.target.value), onKeyDown: event => { if (event.key === 'ArrowDown' && visible.length) { event.preventDefault(); pick(selected || visible[0], true) } } })),
        h('div', { className: 'gg-du-controls' },
          h('button', { type: 'button', className: 'gg-du-button', disabled: index <= 0, onClick: () => move(-1) }, 'Previous'),
          h('span', { className: 'gg-du-position' }, `${index + 1} / ${visible.length}`),
          h('button', { type: 'button', className: 'gg-du-button', disabled: index < 0 || index >= visible.length - 1, onClick: () => move(1) }, 'Next')),
        h('div', { ref: listRef, className: 'gg-du-filelist', onKeyDown: event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
          else if ((event.key === 'Home' || event.key === 'End') && visible.length) { event.preventDefault(); pick(visible[event.key === 'Home' ? 0 : visible.length - 1], true) }
        } }, !visible.length ? h('div', { className: 'gg-empty' }, files.length ? 'No files match the filter.' : 'No changed files.') : groups.map(([group, title]) => {
          const entries = visible.filter(file => file.group === group)
          if (!entries.length) return null
          return h('section', { key: group, className: 'gg-du-group', 'aria-label': title },
            h('h4', { className: 'gg-du-group-title' }, `${title} · ${entries.length}`),
            entries.map(file => {
              const id = diffFileIdentity(file, mode)
              const title = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
              const status = fileStatus(file)
              return h('button', { key: id, type: 'button', className: `gg-du-file${id === selectedId ? ' is-selected' : ''}`, title,
                tabIndex: id === selectedId ? 0 : -1, 'aria-pressed': id === selectedId, 'data-status': status.code,
                ref: node => { if (node) rows.current.set(id, node); else rows.current.delete(id) }, onClick: () => pick(file, false),
              }, h(FileIcon, { path: file.path }), h('span', { className: 'gg-sr-only' }, `${status.title}: `), h('span', { className: 'gg-du-path' }, title))
            }))
        })))
      const second = h(DiffPanel, { sessionId, signal, revision, params: selected ? { mode, base, head, path: selected.path, oldPath: selected.oldPath, group: selected.group, staged: selected.group === 'staged' } : {} })
      return h('div', { className: 'gg-du-workspace' }, h(SplitPane, { first, second, axis: 'auto', initial: 30, label: 'File list and diff' }))
    }

    /**
     * The small icon set this plugin draws, as inline SVG.
     *
     * Icons are drawn here rather than pulled from an icon font because the
     * sidebar's own controls are inline SVG at a fixed 16px box; matching that
     * keeps these buttons looking like the ones beside them.
     *
     * The default size is the 15px toolbar box these buttons share; the guide
     * capsule asks for its own pixel size and is passed one.
     *
     * @param props - which glyph to draw, at what size and with which class.
     * @returns the SVG element.
     */
    function GitIcon({ name, size = 15, className }) {
      const common = {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', 'stroke-width': 1.4,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        ...(className === undefined ? {} : { className }),
      }
      const paths = {
        refresh: ['M13.5 8a5.5 5.5 0 1 1-1.6-3.9', 'M13.6 1.9v3.2h-3.2'],
        changes: ['M2 8h2.5l1.6-3.4L8 11.6l1.6-3.6H14'],
        branch: ['M4 5v6', 'M4 9c0-4 8-1 8-5', 'M4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M4 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M12 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3'],
        copy: ['M6 6V3.5h7.5V11H11', 'M2.5 6H10v6.5H2.5z'],
        wrap: ['M2 4h12', 'M2 8h8.5a2 2 0 1 1 0 4H8', 'M2 12h3', 'M9.5 11l1.5 1-1.5 1'],
        expand: ['M8 3v10', 'M3 8h10'],
        collapse: ['M3 8h10'],
      }
      return h('svg', common, (paths[name] ?? []).map((d, i) => h('path', { key: i, d })))
    }

    /**
     * The guide capsule's glyph: the tab chip's branch mark, at the guide's size.
     *
     * The guide renders an entry's icon at its own pixel size and, without one,
     * falls back to its neutral cube placeholder. The plugin wants the capsule to
     * carry what the Git tab carries, so this wrapper forwards the size and names
     * its own class for the orange ink.
     *
     * @param props - the size the guide's entry renderer asked for.
     * @returns the SVG element.
     */
    function GuideGlyph({ size }) {
      return h(GitIcon, { name: 'branch', size: size ?? 16, className: 'gg-guide-icon' })
    }

    /**
     * The right-click menu for a commit.
     *
     * Everything here is a read: copy a hash, open a commit, compare two. The
     * write actions a full Git client offers — checkout, merge, rebase, reset —
     * are deliberately absent, because this plugin never modifies a repository.
     *
     * @param props - the menu's position and commit, and the actions it offers.
     * @returns the menu element, or null before a commit is chosen.
     */
    function ContextMenu({ menu, markers, onClose, onOpenCommit, onCompare, onCompareSelected, onFlash }) {
      const ref = React.useRef(null)

      // A menu that outlives the press that dismissed it would sit over the
      // graph, so any press outside it closes it.
      //
      // The listener is attached on the next task rather than immediately: the
      // event that opened this menu is still being dispatched while the effect
      // runs, and a listener registered now would receive that same press and
      // close the menu in the same breath. Deferring also lets a right-click on
      // another row close this menu and open the next one, which is what a
      // reader expects from a context menu.
      React.useEffect(() => {
        const dismiss = (event) => {
          if (event.type === 'keydown' && event.key !== 'Escape') return
          if (event.type !== 'keydown' && ref.current !== null && ref.current.contains(event.target)) return
          onClose()
        }
        // Only presses and Escape close it. A `contextmenu` listener would
        // close the menu on the very press that opened it, because the press is
        // still travelling to the document when this effect runs — and it would
        // also close the menu the moment a row's own handler opened the next
        // one, since both handlers see the same event.
        const timer = setTimeout(() => {
          document.addEventListener('mousedown', dismiss)
          document.addEventListener('keydown', dismiss)
        }, 0)
        return () => {
          clearTimeout(timer)
          document.removeEventListener('mousedown', dismiss)
          document.removeEventListener('keydown', dismiss)
        }
      }, [onClose])

      const commit = menu.commit
      const items = [
        {
          label: 'Copy commit hash',
          run: () => { copyText(commit.hash); onFlash('Hash copied') },
        },
        {
          label: 'Copy short hash',
          run: () => { copyText(commit.hash.slice(0, 8)); onFlash('Short hash copied') },
        },
        {
          label: 'Copy subject',
          run: () => { copyText(commit.subject); onFlash('Subject copied') },
        },
        {
          label: 'Open commit details',
          run: () => onOpenCommit(commit),
        },
      ]
      if (onCompare && markers.includes(commit.hash)) {
        items.push({
          label: 'Use as comparison base',
          run: () => { onCompare(commit); onFlash('Added to the comparison') },
        })
        if (markers.length === 2) {
          items.push({
            label: 'Compare the two marked commits',
            run: () => { onCompareSelected(); onFlash('Comparing') },
          })
        }
      } else if (onCompare) {
        items.push({
          label: 'Mark for comparison',
          run: () => { onCompare(commit); onFlash('Marked — pick a second commit') },
        })
      }

      // The menu is placed at the pointer but kept inside the viewport, so a
      // right-click near an edge still shows every item.
      const width = 230
      const height = items.length * 26 + 14
      const left = Math.min(menu.x, window.innerWidth - width - 8)
      const top = Math.min(menu.y, window.innerHeight - height - 8)

      return h('div', {
        ref,
        className: 'gg-menu',
        style: { left: `${left}px`, top: `${top}px` },
        role: 'menu',
      }, [
        ...items.map((item, i) => h('button', {
          key: i,
          type: 'button',
          className: 'gg-menu-item',
          role: 'menuitem',
          onClick: () => { item.run(); onClose() },
        }, item.label)),
        h('div', { key: 'note', className: 'gg-menu-note' }, commit.hash.slice(0, 10)),
      ])
    }

    /**
     * Copy text to the clipboard.
     *
     * The asynchronous clipboard API is unavailable on a non-secure origin, and
     * a DSH reached over plain HTTP on a LAN address is exactly that, so the
     * older selection-based path is kept as the fallback rather than leaving the
     * action silently doing nothing.
     *
     * @param text - the text to copy.
     */
    function copyText(text) {
      try {
        if (navigator.clipboard !== undefined && window.isSecureContext === true) {
          void navigator.clipboard.writeText(text)
          return
        }
        const field = document.createElement('textarea')
        field.value = text
        field.setAttribute('readonly', '')
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.appendChild(field)
        field.select()
        document.execCommand('copy')
        field.remove()
      } catch {
        // A refused clipboard leaves the reader exactly where they were; the
        // hash remains visible and selectable in the view.
      }
    }

    /**
     * Format an ISO date for a reader.
     *
     * @param iso - the ISO-8601 string git produced.
     * @returns a local, complete date and time.
     */
    function formatDate(iso) {
      const when = new Date(iso)
      if (Number.isNaN(when.getTime())) return iso
      return when.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    }

    /**
     * Format a time of day.
     *
     * A working-tree read that failed leaves no snapshot time behind, so an
     * absent or unreadable moment returns `null` instead of throwing: the view
     * reports the failure rather than dying inside a formatter.
     *
     * @param date - the moment, or nothing when there is no reading.
     * @returns the local time, or `null` when there is none to show.
     */
    function formatTime(date) {
      if (date === null || date === undefined) return null
      const when = date instanceof Date ? date : new Date(date)
      if (Number.isNaN(when.getTime())) return null
      return when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    /**
     * Resolve the session a tab belongs to, and refuse to render without one.
     *
     * @param props - the slot's framework-injected props.
     * @returns the view.
     */
    function sessionOf(props) {
      const { sessionId, useSessions } = props
      const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
      return { sessionId: String(sessionId), cwd }
    }

    /**
     * The Graph tab's body.
     *
     * @param props - the slot's framework-injected props.
     * @returns the view.
     */
    function GraphBody(props) {
      const tabInfo = props.useTabInfo()
      const { sessionId, cwd } = sessionOf(props)
      if (cwd === undefined || cwd === null) {
        return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
      }
      return h('div', { className: 'gg-host' }, h(GraphView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
    }

    /**
     * The Commit tab's body.
     *
     * @param props - the slot's framework-injected props.
     * @returns the view.
     */
    function CommitBody(props) {
      const tabInfo = props.useTabInfo()
      const { sessionId, cwd } = sessionOf(props)
      if (cwd === undefined || cwd === null) {
        return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
      }
      return h('div', { className: 'gg-host' }, h(CommitView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
    }

    /**
     * The Diff tab's body.
     *
     * @param props - the slot's framework-injected props.
     * @returns the view.
     */
    function DiffBody(props) {
      const tabInfo = props.useTabInfo()
      const { sessionId, cwd } = sessionOf(props)
      if (cwd === undefined || cwd === null) {
        return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
      }
      return h('div', { className: 'gg-host' }, h(DiffView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
    }

    /**
     * The Changes tab's body.
     *
     * @param props - the slot's framework-injected props.
     * @returns the view.
     */
    function ChangesBody(props) {
      const tabInfo = props.useTabInfo()
      const { sessionId, cwd } = sessionOf(props)
      if (cwd === undefined || cwd === null) {
        return h('div', { className: 'gg-empty' }, 'This session has no workspace directory yet.')
      }
      return h('div', { className: 'gg-host' }, h(ChangesView, { key: `${sessionId}:${cwd}`, tabInfo, sessionId }))
    }

    /** The graph tab's chip title. */
    function GraphTitle() {
      return h('span', { className: 'gg-tab-title' }, h('span', { className: 'gg-tab-icon' }, h(GitIcon, { name: 'branch' })), 'Git')
    }

    /**
     * The commit tab's chip title: the short hash, so two of them are told apart.
     *
     * @param props - the tab's live information.
     * @returns the title.
     */
    function CommitTitle({ useTabInfo }) {
      const { tab } = useTabInfo()
      const hash = tab.navigation?.params?.hash
      return typeof hash === 'string' ? hash.slice(0, 7) : 'Commit'
    }

    /**
     * The diff tab's chip title: the file's own name.
     *
     * @param props - the tab's live information.
     * @returns the title.
     */
    function DiffTitle({ useTabInfo }) {
      const { tab } = useTabInfo()
      const params = tab.navigation?.params ?? {}
      const path = typeof params.path === 'string' ? params.path : 'Diff'
      const parts = path.split('/')
      return parts[parts.length - 1] || 'Diff'
    }

    /** The Changes tab's chip title. */
    function ChangesTitle() {
      return 'Changes'
    }

    /** The tab types this package registers. */
    const definitions = [
      {
        id: ID,
        kind: KIND,
        priority: 'extension',
        title: () => 'Git',
        guide: [{
          order: 20,
          title: () => 'Git graph',
          description: () => 'Commit history and uncommitted changes of this session’s workspace',
          icon: GuideGlyph,
        }],
      },
      {
        id: COMMIT_ID,
        kind: COMMIT_KIND,
        priority: 'extension',
        title: () => 'Commit',
      },
      {
        id: DIFF_ID,
        kind: DIFF_KIND,
        priority: 'extension',
        multiple: true,
         title: () => 'Diff',
      },
      {
        id: CHANGES_ID,
        kind: CHANGES_KIND,
        priority: 'extension',
        title: () => 'Changes',
      },
    ]

    /** Styles, built once and removed with the plugin. */
    const CSS = `
.gg-tab-title { display: inline-flex; align-items: center; gap: 5px; }
.gg-tab-icon { display: inline-flex; color: #ed7957; }
/* The guide capsule carries the tab chip's branch mark in the same ink. */
.gg-guide-icon { color: #ed7957; }
.gg-du-metadata { flex: none; max-height: 30%; overflow: auto; padding: 3px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 10px; }
.gg-du-metadata summary { cursor: pointer; }
.gg-du-metadata pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 5px 0; font: 10px/1.5 ui-monospace, monospace; }

/* The entire SVG is above row backgrounds, never above text or menus. */
.gg-graph-inner { isolation: isolate; }
.gg-canvas { z-index: 2; }
.gg-rows { z-index: 1; }
.gg-du-status[data-status='M'] { color: light-dark(#966100, #e5b454); }
.gg-du-status[data-status='A'], .gg-du-status[data-status='?'] { color: light-dark(#16733c, #78ce96); }
.gg-du-status[data-status='D'], .gg-du-status[data-status='U'] { color: light-dark(#ba3434, #f48787); }
.gg-du-status[data-status='R'], .gg-du-status[data-status='C'] { color: light-dark(#176eb0, #7cbbef); }
.gg-du-code .hljs-keyword, .gg-du-code .hljs-selector-tag, .gg-du-code .hljs-literal { color: light-dark(#9333a6, #c792ea); }
.gg-du-code .hljs-string, .gg-du-code .hljs-regexp, .gg-du-code .hljs-template-string { color: light-dark(#286536, #b5d990); }
.gg-du-code .hljs-comment, .gg-du-code .hljs-quote { color: light-dark(#667466, #8eaa88); font-style: italic; }
.gg-du-code .hljs-number, .gg-du-code .hljs-symbol, .gg-du-code .hljs-bullet { color: light-dark(#995300, #e6b577); }
.gg-du-code .hljs-title, .gg-du-code .hljs-section, .gg-du-code .hljs-built_in { color: light-dark(#175eab, #82baff); }
.gg-du-code .hljs-attr, .gg-du-code .hljs-attribute, .gg-du-code .hljs-property { color: light-dark(#924d12, #e8c07d); }
.gg-du-code .hljs-tag, .gg-du-code .hljs-name, .gg-du-code .hljs-type { color: light-dark(#006d76, #7fcfd7); }
.gg-du-code .hljs-meta { color: light-dark(#7a4b9c, #bba0d7); }

.gg-du-workspace > .gg-split-vertical { min-height: 360px; grid-template-rows: minmax(180px, var(--gg-ratio)) 7px minmax(130px, 1fr); }
.gg-du-workspace { overflow: auto !important; }
.gg-du-filepane .gg-du-controls { padding-block: 3px; }
.gg-du-filter { padding-block: 4px !important; }

/* Append to the existing plugin stylesheet. SplitPane owns responsive sizing. */
.gg-du-workspace { display: flex; flex: 1 1 0; min-width: 0; min-height: 0; overflow: hidden; }
.gg-du-workspace > * { flex: 1; min-width: 0; min-height: 0; }
.gg-du-panel, .gg-du-filepane { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: var(--dsh-content-font-size, 14px); line-height: 1.45; }
.gg-du-title { padding: 8px 10px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 12px/1.5 ui-monospace, monospace; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-controls { position: relative; z-index: 8; display: flex; flex: none; align-items: center; flex-wrap: wrap; gap: 3px; min-height: 32px; padding: 4px 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-button { box-sizing: border-box; height: 24px; color: var(--dsw-alias-label-secondary); background: transparent; border: 1px solid transparent; border-radius: 3px; font: 12px/22px inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
.gg-du-dropdown { position: relative; height: 24px; flex: none; font-size: 12px; }
.gg-du-layout-select { width: 92px; }
.gg-du-context-select { width: 100px; }
.gg-du-dropdown-trigger { box-sizing: border-box; width: 100%; height: 24px; display: flex; align-items: center; gap: 5px; padding: 0 5px 0 7px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border: 1px solid transparent; border-radius: 3px; font: inherit; text-align: left; cursor: pointer; }
.gg-du-dropdown-trigger > span:first-child { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-du-dropdown-chevron { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1; transform: translateY(-1px); }
.gg-du-dropdown.is-open .gg-du-dropdown-chevron { transform: rotate(180deg) translateY(1px); }
.gg-du-dropdown-menu { position: absolute; top: calc(100% + 3px); left: 0; z-index: 30; min-width: 100%; width: max-content; max-width: 180px; padding: 3px; overflow: hidden; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base)); border: 1px solid var(--dsw-alias-border-l2); border-radius: 5px; box-shadow: 0 6px 18px rgba(0,0,0,.38); }
.gg-du-dropdown-option { box-sizing: border-box; width: 100%; min-width: 116px; height: 25px; display: flex; align-items: center; gap: 5px; padding: 0 8px 0 4px; color: inherit; background: transparent; border: 0; border-radius: 3px; font: inherit; text-align: left; white-space: nowrap; cursor: pointer; }
.gg-du-dropdown-option:hover, .gg-du-dropdown-option:focus-visible { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover)); outline: none; }
.gg-du-dropdown-option.is-selected { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.gg-du-dropdown-check { width: 13px; flex: none; color: var(--dsw-alias-brand-primary); text-align: center; }
.gg-du-icon-button { width: 24px; padding: 0; }
.gg-du-language { min-width: 30px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.gg-du-button:hover:not(:disabled), .gg-du-button[aria-pressed="true"], .gg-du-dropdown-trigger:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.gg-du-button[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); }
.gg-du-button:disabled { opacity: .4; cursor: default; }
.gg-du-button:focus-visible, .gg-du-dropdown-trigger:focus-visible, .gg-du-file:focus-visible, .gg-du-filter input:focus-visible, .gg-du-scroll:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.gg-du-counts { white-space: nowrap; margin-inline-end: auto; padding: 0 4px; font: 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.gg-du-added { color: var(--dsw-alias-state-success-primary, #22863a); }
.gg-du-deleted { color: var(--dsw-alias-state-error-primary, #cb2431); }
.gg-du-position, .gg-du-summary { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.gg-du-summary { flex: none; padding: 5px 10px; overflow-wrap: anywhere; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-scroll { flex: 1 1 0; min-height: 0; min-width: 0; overflow: auto; overscroll-behavior: contain; position: relative; }
.gg-du-patch { width: max-content; min-width: 100%; font: var(--dsh-content-font-size, 14px)/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; tab-size: 4; }
.gg-du-line { display: grid; grid-template-columns: 5ch 5ch minmax(0, 1fr); min-height: 1.6em; }
.gg-du-split { min-width: 720px; }
.gg-du-split-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 1.6em; }
.gg-du-side { display: grid; grid-template-columns: 5ch minmax(0, 1fr); min-width: 0; }
.gg-du-side.gg-du-old { border-right: 1px solid var(--dsw-alias-border-l1); }
.gg-du-side.gg-du-old.gg-du-del, .gg-du-side.gg-du-old.gg-du-replacement { background: rgba(248, 81, 73, .13); }
.gg-du-side.gg-du-new.gg-du-add, .gg-du-side.gg-du-new.gg-du-replacement { background: rgba(46, 160, 67, .13); }
.gg-du-side.is-empty { background: var(--dsw-alias-bg-layer-2); opacity: .4; }
.gg-du-split-row .gg-du-old .gg-du-code::first-letter { color: var(--dsw-alias-label-secondary); }
.gg-du-split-hunk { grid-column: 1 / -1; min-height: 1.6em; padding: 0 8px; background: rgba(76, 154, 255, .12); color: var(--dsw-alias-brand-primary); }
.gg-du-split-hunk.is-current { box-shadow: inset 3px 0 var(--dsw-alias-brand-primary); }
.gg-du-split-note { grid-column: 1 / -1; min-height: 1.6em; padding: 0 8px; color: var(--dsw-alias-label-secondary); font-style: italic; }
.gg-du-number { text-align: right; padding: 0 6px 0 2px; user-select: none; color: var(--dsw-alias-label-secondary); border-right: 1px solid var(--dsw-alias-border-l1); font-variant-numeric: tabular-nums; }
.gg-du-code { padding: 0 8px; white-space: pre; }
.gg-du-add { background: rgba(46, 160, 67, .13); }
.gg-du-del { background: rgba(248, 81, 73, .13); }
.gg-du-hunk { background: rgba(76, 154, 255, .12); color: var(--dsw-alias-brand-primary); }
.gg-du-hunk.is-current { box-shadow: inset 3px 0 var(--dsw-alias-brand-primary); }
.gg-du-meta, .gg-du-note { color: var(--dsw-alias-label-secondary); }
.gg-du-note { font-style: italic; }
.gg-du-patch.is-wrapped { width: 100%; }
.gg-du-split.is-wrapped { min-width: 100%; }
.gg-du-patch.is-wrapped .gg-du-code { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.gg-du-message { padding: 10px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); line-height: 1.5; }
.gg-du-filter { padding: 8px; flex: none; }
.gg-du-filter input { box-sizing: border-box; width: 100%; min-width: 0; color: inherit; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; padding: 6px 8px; font: inherit; }
.gg-du-filelist { overflow: auto; min-height: 0; flex: 1 1 0; overscroll-behavior: contain; }
.gg-du-group-title { position: sticky; top: 0; z-index: 1; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); margin: 0; padding: 7px 10px; font-size: 11px; font-weight: 600; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-file { display: flex; gap: 8px; align-items: center; width: 100%; box-sizing: border-box; padding: 7px 10px; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); background: transparent; text-align: left; color: inherit; font: inherit; cursor: pointer; }
.gg-du-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-du-file.is-selected { background: rgba(76, 154, 255, .14); }
.gg-du-path { min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }

/* Match the public VS Code Git Graph table: 24px rows, fixed graph gutter and 13px cells. */
.gg-section-heading.gg-column-heading, .gg-row { display: grid; grid-template-columns: var(--gg-lane-width, 100px) minmax(220px, 1fr) 150px 72px 72px; column-gap: 0; align-items: center; }
.gg-section-heading.gg-column-heading { min-height: 31px; padding: 0; background: transparent; border-block: 1px solid var(--dsw-alias-border-l1); font-size: inherit; font-weight: 600; line-height: 30px; }
.gg-column-heading > span { height: 30px; padding: 0 12px; border-right: 1px solid var(--dsw-alias-border-l1); text-align: center; }
.gg-column-heading > span:last-child { border-right: 0; }
.gg-column-refresh { border: 0; padding: 0; color: inherit; background: transparent; font: inherit; font-weight: inherit; cursor: pointer; }
.gg-column-refresh:hover { color: var(--dsw-alias-label-primary); }
.gg-row { box-sizing: border-box; height: ${ROW_H}px; padding: 0 !important; border: 0; line-height: 26px; }
.gg-row > .gg-row-body { display: contents; }
.gg-row > .gg-row-body > .gg-description { grid-column: 2; grid-row: 1; display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; padding: 0 4px; }
.gg-row > .gg-row-body > .gg-row-meta { display: contents; }
.gg-row > .gg-row-body > .gg-row-meta > .gg-date { grid-column: 3; grid-row: 1; padding: 0 4px; }
.gg-row > .gg-row-body > .gg-row-meta > .gg-author { grid-column: 4; grid-row: 1; padding: 0 4px; }
.gg-row > .gg-row-body > .gg-row-meta > .gg-hash { grid-column: 5; grid-row: 1; padding: 0 4px; }
.gg-hash { font-family: inherit; color: var(--dsw-alias-label-secondary); }
.gg-row-stack { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: ${ROW_H}px; }
.gg-row-stack > .gg-row { flex: 0 0 ${ROW_H}px; }
.gg-row-stack > .gg-accordion { position: relative; z-index: 3; flex: 0 0 var(--gg-accordion-height, ${ACCORDION_H}px); }
.gg-accordion { display: grid; grid-template-columns: minmax(0, calc(var(--gg-accordion-split, 50%) - 3px)) 6px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 6px; height: var(--gg-accordion-height, ${ACCORDION_H}px); min-height: ${ACCORDION_MIN_H}px; max-height: ${ACCORDION_MAX_H}px; margin-left: var(--gg-lane-width, 100px); overflow: hidden; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 52%, var(--dsw-alias-bg-base)); }
.gg-accordion-meta, .gg-accordion-files { min-width: 0; min-height: 0; overflow: auto; padding: 10px; }
.gg-accordion-meta { grid-column: 1; grid-row: 1; }
.gg-accordion-files { grid-column: 3; grid-row: 1; }
.gg-accordion-column-resizer { grid-column: 2; grid-row: 1; position: relative; cursor: col-resize; background: var(--dsw-alias-border-l1); touch-action: none; }
.gg-accordion-column-resizer::after { content: ''; position: absolute; inset: 0 -3px; }
.gg-accordion-height-resizer { grid-column: 1 / -1; grid-row: 2; position: relative; cursor: row-resize; background: var(--dsw-alias-border-l1); touch-action: none; }
.gg-accordion-height-resizer::after { content: ''; position: absolute; inset: -3px 0; }
.gg-accordion-column-resizer:hover, .gg-accordion-column-resizer:focus-visible, .gg-accordion-height-resizer:hover, .gg-accordion-height-resizer:focus-visible { background: var(--dsw-alias-brand-primary); outline: none; }
.gg-accordion-state { grid-template-columns: 1fr; }
.gg-accordion-state-content { grid-column: 1; grid-row: 1; display: flex; align-items: flex-start; justify-content: flex-start; gap: 7px; padding: 10px; color: var(--dsw-alias-label-secondary); }
.gg-accordion-state-content > .gg-spinner { margin-top: 4px; }
.gg-accordion-state.is-error .gg-accordion-state-content { flex-direction: column; color: var(--dsw-alias-state-error-primary); }
.gg-accordion-state.is-error .gg-accordion-state-content span { max-width: min(560px, 80%); color: var(--dsw-alias-label-secondary); text-align: left; overflow-wrap: anywhere; }
.gg-accordion-message { margin: 22px 0 0; padding: 0; white-space: pre-wrap; color: var(--dsw-alias-label-primary); }
.gg-accordion .gg-meta { grid-template-columns: max-content minmax(0, 1fr); gap: 1px 4px; margin: 0; font-size: inherit; line-height: 1.4; }
.gg-accordion .gg-meta dt { color: var(--dsw-alias-label-primary); }
.gg-accordion-working { display: block; }
.gg-working-title { margin: 0 0 3px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.gg-tree { min-width: 0; }
.gg-tree-folder-name { display: flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); font-weight: 600; min-height: 22px; padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-tree-chevron { display: inline-block; width: 12px; color: var(--dsw-alias-label-secondary); }
.gg-tree-children { padding-left: 17px; }
.gg-tree-file { width: 100%; min-height: 22px; padding: 0 3px; border: 0; border-radius: 0; background: transparent; text-align: left; color: inherit; }
.gg-tree-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-tree-file .gg-path { flex: 1; }
.gg-file-counts { flex: none; display: inline-flex; gap: 4px; font-family: inherit; font-size: inherit; white-space: nowrap; }
.gg-file-added { color: #3fb950; }
.gg-file-removed { color: #f85149; }
.gg-working-group + .gg-working-group { margin-top: 9px; padding-top: 7px; border-top: 1px solid var(--dsw-alias-border-l1); }
@container (max-width: 760px) { .gg-section-heading.gg-column-heading, .gg-row { grid-template-columns: var(--gg-lane-width, 100px) minmax(0, 1fr) 112px; } .gg-column-heading span:nth-child(4), .gg-column-heading span:nth-child(5), .gg-row .gg-author, .gg-row .gg-hash { display: none; } .gg-column-heading span:nth-child(3), .gg-row .gg-date { grid-column: 3; } .gg-accordion { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) 6px; margin-left: var(--gg-lane-width, 100px); } .gg-accordion-meta { grid-column: 1; grid-row: 1; border-bottom: 1px solid var(--dsw-alias-border-l1); } .gg-accordion-files { grid-column: 1; grid-row: 2; } .gg-accordion-column-resizer { display: none; } .gg-accordion-height-resizer { grid-row: 3; } .gg-accordion-state { grid-template-rows: minmax(0, 1fr) 6px; } .gg-accordion-state .gg-accordion-height-resizer { grid-row: 2; } }

.gg-host { display: flex; flex-direction: column; height: 100%; min-height: 0;
  font-family: inherit; font-size: var(--dsh-content-font-size, 14px); line-height: 1.45; color: var(--dsw-alias-label-primary); }
.gg-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* The toolbar is one thin row: a name, a count, and icon buttons. */
.gg-toolbar { display: flex; align-items: center; gap: 4px; padding: 5px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); flex: none; min-width: 0; }
.gg-repo { font-weight: 600; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; min-width: 0; flex: 1; }
.gg-count { color: var(--dsw-alias-label-secondary); font-size: 11px; flex: none; }
.gg-mono { font-family: ui-monospace, monospace; font-weight: 500; }
.gg-icon-btn { flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; cursor: pointer; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary); }
.gg-icon-btn:hover { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.gg-icon-btn.is-on { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary); }
.gg-notice { flex: none; padding: 3px 10px; font-size: 11px;
  color: var(--dsw-alias-state-success-primary); }

/* The graph scrolls on its own so the toolbar stays put. */
.gg-graph { overflow: auto; flex: 1; min-height: 0; }
.gg-graph-inner { position: relative; }
.gg-canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
.gg-rows { position: relative; }
.gg-row { height: ${ROW_H}px; cursor: pointer; min-width: 0; }
.gg-row:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-row.is-comparing { box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
.gg-row-body { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
/* The subject is the only element allowed to shrink; everything else is fixed. */
.gg-subject { flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.gg-row-meta { display: flex; gap: 8px; flex: 0 0 auto; max-width: 45%;
  color: var(--dsw-alias-label-secondary); font-size: inherit; }
.gg-author { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-date { flex: none; font-variant-numeric: tabular-nums; }
.gg-refs { display: inline-flex; gap: 5px; flex: 0 1 auto; max-width: min(54%, 420px); overflow: hidden; }
.gg-ref { display: inline-flex; flex: 0 1 auto; min-width: 0; height: 20px; border-radius: 4px; line-height: 18px; white-space: nowrap; overflow: hidden; max-width: 210px; background: rgba(128,128,128,.15); border: 1px solid rgba(128,128,128,.7); }
.gg-ref-icon { display: inline-flex; align-items: center; justify-content: center; width: 19px; flex: none; margin: -1px 0 -1px -1px; color: var(--dsw-alias-bg-base); background: var(--gg-ref-color); }
.gg-ref-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 0 5px; color: var(--dsw-alias-label-primary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.gg-ref-head { border-color: var(--gg-ref-color); font-weight: 600; }
.gg-ref-head .gg-ref-icon { color: white; }
.gg-history-status { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 30px; padding: 2px 10px 8px; color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.gg-spinner { box-sizing: border-box; width: 12px; height: 12px; flex: none; border: 1.5px solid color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor; border-radius: 50%; animation: gg-spin .75s linear infinite; }
@keyframes gg-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gg-spinner { animation-duration: 1.8s; } }
.gg-more-btn { display: block; margin: 5px auto 10px; font: inherit; font-size: var(--dsh-content-font-size-secondary, 13px); padding: 3px 9px; cursor: pointer; border-radius: 3px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.gg-more-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }

.gg-scroll { overflow: auto; flex: 1; min-height: 0; }
.gg-detail-wrap { padding: 10px; }
.gg-msg { white-space: pre-wrap; margin: 0 0 10px; line-height: 1.45; }
.gg-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 10px; margin: 0 0 10px; font-size: 11px; }
.gg-meta dt { font-weight: 600; color: var(--dsw-alias-label-secondary); }
.gg-meta dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
.gg-link { font: inherit; padding: 0; cursor: pointer; border: 0; background: none;
  color: var(--dsw-alias-brand-primary); text-decoration: underline; }
.gg-compare-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 5px 8px; margin-bottom: 8px; border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2); font-size: 11px; }
.gg-detail-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--dsw-alias-label-secondary); margin: 8px 0 4px; }
.gg-diff-summary { flex: none; padding: 4px 10px; font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l1); }

.gg-files { display: flex; flex-direction: column; }
.gg-file { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 4px; cursor: pointer; min-width: 0; }
.gg-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-file-icon { flex: none; width: 16px; height: 16px; fill: color-mix(in srgb, var(--dsw-alias-label-secondary) 22%, transparent); stroke: var(--dsw-alias-label-secondary); stroke-width: 1.2; stroke-linejoin: round; }
.gg-file-icon-folder { fill: light-dark(#d9a441, #dcb659); stroke: light-dark(#8d681e, #e6c46d); }
.gg-file-icon-js, .gg-file-icon-jsx { fill: #d7ba7d33; stroke: #d7ba7d; }
.gg-file-icon-ts, .gg-file-icon-tsx { fill: #519aba33; stroke: #519aba; }
.gg-file-icon-json { fill: #cbcb4133; stroke: #cbcb41; }
.gg-file-icon-md, .gg-file-icon-markdown { fill: #519aba33; stroke: #519aba; }
.gg-file-icon-css, .gg-file-icon-scss { fill: #42a5f533; stroke: #42a5f5; }
.gg-file-icon-html { fill: #e3793333; stroke: #e37933; }
.gg-file-icon-py { fill: #ffd43b33; stroke: #4b8bbe; }
.gg-file-icon-fold { fill: none; }
.gg-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font: inherit; }
.gg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.gg-file[data-status='M'], .gg-du-file[data-status='M'] { --gg-status-accent: #e2a93b; }
.gg-file[data-status='A'], .gg-file[data-status='?'], .gg-du-file[data-status='A'], .gg-du-file[data-status='?'] { --gg-status-accent: #3fb950; }
.gg-file[data-status='D'], .gg-file[data-status='U'], .gg-du-file[data-status='D'], .gg-du-file[data-status='U'] { --gg-status-accent: #f85149; }
.gg-file[data-status='R'], .gg-file[data-status='C'], .gg-du-file[data-status='R'], .gg-du-file[data-status='C'] { --gg-status-accent: #58a6ff; }
.gg-file[data-status] .gg-path, .gg-du-file[data-status] .gg-du-path { color: var(--gg-status-accent); }
.gg-group { padding: 0 10px 10px; }

/* The patch: one scroll container, one monospace column, no inner scrolling. */
.gg-diff { padding: 0; }
.gg-diff .gg-patch { border-radius: 0; background: transparent; padding: 4px 0; }
.gg-patch { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.55;
  margin: 0; }
.gg-diff.is-wrapped .gg-line { white-space: pre-wrap; word-break: break-word; }
.gg-line { padding: 0 10px; white-space: pre; }
.gg-line-add { background: rgba(52,199,89,.14); color: #7ee2a8; }
.gg-line-del { background: rgba(255,69,58,.14); color: #ff9a94; }
.gg-line-hunk { color: var(--dsw-alias-brand-primary); background: rgba(76,154,255,.08); }
.gg-line-meta { color: var(--dsw-alias-label-secondary); }
.gg-line-note { color: var(--dsw-alias-label-secondary); font-style: italic; }

.gg-empty { padding: 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.gg-slim { padding: 4px 4px 6px; }
.gg-error { padding: 10px; color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.gg-error-detail { white-space: pre-wrap; font-size: 10.5px; opacity: .85; margin: 6px 0 0; }
.gg-truncated { padding: 6px 10px; color: var(--dsw-alias-state-warn-primary);
  font-size: 10.5px; }

/* The context menu floats over the graph, so it is fixed to the viewport. */
.gg-menu { position: fixed; z-index: 940; min-width: 230px; padding: 5px;
  border-radius: 8px; background: var(--dsw-alias-bg-overlay, #2C2C2E);
  border: 1px solid var(--dsw-alias-border-l2); box-shadow: var(--dsw-shadow-lv3);
  display: flex; flex-direction: column; }
.gg-menu-item { font: inherit; font-size: 11.5px; text-align: left; padding: 5px 8px;
  cursor: pointer; border: 0; border-radius: 5px; background: none;
  color: var(--dsw-alias-label-primary); }
.gg-menu-item:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-menu-note { padding: 4px 8px 2px; font-size: 10px;
  color: var(--dsw-alias-label-secondary); font-family: ui-monospace, monospace; }
.gg-host { min-width: 0; overflow: hidden; }
.gg-workbench { container-type: inline-size; }
.gg-root { min-width: 0; overflow: hidden; }
.gg-mode-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.gg-mode-content[hidden] { display: none; }
.gg-split { display: grid; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.gg-split-horizontal { grid-template-columns: minmax(0, var(--gg-ratio)) 7px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.gg-split-vertical { grid-template-rows: minmax(0, var(--gg-ratio)) 7px minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); }
.gg-split-first, .gg-split-second { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.gg-divider { background: var(--dsw-alias-bg-layer-2); position: relative; touch-action: none; outline-offset: -2px; }
.gg-divider::after { content: ''; position: absolute; background: var(--dsw-alias-border-l2); border-radius: 2px; }
.gg-split-horizontal > .gg-divider { cursor: col-resize; }
.gg-split-horizontal > .gg-divider::after { width: 3px; height: 30px; top: calc(50% - 15px); left: 2px; }
.gg-split-vertical > .gg-divider { cursor: row-resize; }
.gg-split-vertical > .gg-divider::after { height: 3px; width: 30px; left: calc(50% - 15px); top: 2px; }
.gg-divider:hover::after, .gg-divider:focus-visible::after { background: var(--dsw-alias-brand-primary); }
.gg-section-heading { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 12px; letter-spacing: 0; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-readonly { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; padding: 2px 5px; }
.gg-row.is-selected, .gg-file.is-selected { background: rgba(128,128,128,.28); }
.gg-row[aria-pressed=true] .gg-subject { font-weight: 600; }
.gg-row:focus-visible, .gg-file:focus-visible, .gg-host button:focus-visible, .gg-host summary:focus-visible, .gg-host input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.gg-host button:disabled { opacity: .4; cursor: default; }
.gg-row .gg-refs { max-width: 34%; }
.gg-row .gg-subject { min-width: 55px; }
.gg-commit-summary { flex: none; max-height: 38%; overflow: auto; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-commit-summary summary { cursor: pointer; padding: 8px 10px; }
.gg-commit-subject { font-size: 12px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.gg-commit-caption { display: block; font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-commit-extra { padding: 0 10px 10px; font-size: 11px; overflow-wrap: anywhere; }
.gg-commit-extra .gg-link { margin: 4px 6px 0 0; }
@container (max-width: 350px) { .gg-readonly { display: none; } }

`

    /**
     * Register the four tab types, their bodies and titles, and the styles.
     *
     * Every registration is an `ctx.effect`, so unloading this plugin removes
     * the tab types, every slot, and the stylesheet together.
     *
     * @param ctx - the client plugin context.
     */
    function apply(ctx) {
      const bodies = [
        [ID, GraphBody, GraphTitle],
        [COMMIT_ID, CommitBody, CommitTitle],
        [DIFF_ID, DiffBody, DiffTitle],
        [CHANGES_ID, ChangesBody, ChangesTitle],
      ]
      for (const definition of definitions) {
        ctx.effect(() => ctx.sidebarRightTabs.register(definition), `git-graph: ${definition.kind} type`)
      }
      for (const [key, Body, Title] of bodies) {
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key,
        }, Body)), `git-graph: ${key} body`)
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key,
        }, Title)), `git-graph: ${key} title`)
      }
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-dsh-git-graph', '')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'git-graph: styles')
    }

    exports.inject = ['slots', 'sidebarRightTabs']
    exports.apply = apply
    return module.exports
  },
})
