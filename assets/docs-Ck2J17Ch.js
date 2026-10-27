import{a as e,c as t,d as n,f as r,i,l as a,p as o,s,u as c}from"./site-ByWURtyw.js";var l=o(),u=r();function d(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var f=d();function p(e){f=e}var m={exec:()=>null};function h(e){let t=[];return n=>{let r=Math.max(0,Math.min(3,n-1)),i=t[r];return i||(i=e(r),t[r]=i),i}}function g(e,t=``){let n=typeof e==`string`?e:e.source,r={replace:(e,t)=>{let i=typeof t==`string`?t:t.source;return i=i.replace(v.caret,`$1`),n=n.replace(e,i),r},getRegex:()=>new RegExp(n,t)};return r}var _=((e=``)=>{try{return!!RegExp(`(?<=1)(?<!1)`+e)}catch{return!1}})(),v={codeRemoveIndent:/^(?: {0,3}\t| {1,4})/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,endingSpaceTabChar:/[ \t]$/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,leadingSpaceTab:/^[ \t]+/,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] +\S/,listReplaceTask:/^\[[ xX]\] +/,listTaskCheckbox:/\[[ xX]\]/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,numericCharacterReference:/&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,numericCharacterReferenceOrAmpersand:/&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:h(e=>RegExp(`^ {0,${e}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)),hrRegex:h(e=>RegExp(`^ {0,${e}}((?:-[ 	]*){3,}|(?:_[ 	]*){3,}|(?:\\*[ 	]*){3,})(?:\\n+|$)`)),fencesBeginRegex:h(e=>RegExp(`^ {0,${e}}(?:\`\`\`|~~~)`)),headingBeginRegex:h(e=>RegExp(`^ {0,${e}}#`)),htmlBeginRegex:h(e=>RegExp(`^ {0,${e}}(?:</?(?:${T})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`,`i`)),blockquoteBeginRegex:h(e=>RegExp(`^ {0,${e}}>`))},y=/^(?:[ \t]*(?:\n|$))+/,b=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,ee=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,x=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,te=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,S=/ {0,3}(?:[*+-]|\d{1,9}[.)])/,ne=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,re=g(ne).replace(/bull/g,S).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}(?:\s|$)/).replace(/hr/g,/ {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,``).getRegex(),ie=g(ne).replace(/bull/g,S).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}(?:\s|$)/).replace(/hr/g,/ {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),C=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/,ae=/^[^\n]+/,w=/(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/,oe=g(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace(`label`,w).replace(`title`,/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),se=g(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g,S).getRegex(),T=`address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul`,E=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,ce=g(`^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))`,`i`).replace(`comment`,E).replace(`tag`,T).replace(`attribute`,/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),le=e=>g(C).replace(`hr`,x).replace(`heading`,` {0,3}#{1,6}(?:\\s|$)`).replace(`|lheading`,``).replace(`|table`,``).replace(`blockquote`,` {0,3}>`).replace(`fences`," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace(`list`,e).replace(`html`,` {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`).replace(`tag`,T).getRegex(),ue=le(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/),de=le(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/),D={blockquote:g(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace(`paragraph`,de).getRegex(),code:b,def:oe,fences:ee,heading:te,hr:x,html:ce,lheading:re,list:se,newline:y,paragraph:ue,table:m,text:ae},fe=g(`^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)`).replace(`hr`,x).replace(`heading`,` {0,3}#{1,6}(?:\\s|$)`).replace(`blockquote`,` {0,3}>`).replace(`code`,`(?: {4}| {0,3}	)[^\\n]`).replace(`fences`," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace(`list`,` {0,3}(?:[*+-]|1[.)])[ \\t]`).replace(`html`,` {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`).replace(`tag`,T).getRegex(),pe={...D,lheading:ie,table:fe,paragraph:g(C).replace(`hr`,x).replace(`heading`,` {0,3}#{1,6}(?:\\s|$)`).replace(`|lheading`,``).replace(`table`,fe).replace(`blockquote`,` {0,3}>`).replace(`fences`," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace(`list`,` {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]`).replace(`html`,` {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`).replace(`tag`,T).getRegex()},me={...D,html:g(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace(`comment`,E).replace(/tag/g,`(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b`).getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:m,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:g(C).replace(`hr`,x).replace(`heading`,` *#{1,6} *[^
]`).replace(`lheading`,re).replace(`|table`,``).replace(`blockquote`,` {0,3}>`).replace(`|fences`,``).replace(`|list`,``).replace(`|html`,``).replace(`|tag`,``).getRegex()},he=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,ge=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,_e=/^( {2,}|\\)\n(?!\s*$)[ \t]*/,ve=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,O=/[\p{P}\p{S}]/u,k=/[\s\p{P}\p{S}]/u,A=/[^\s\p{P}\p{S}]/u,ye=g(/^((?![*_])punctSpace)/,`u`).replace(/punctSpace/g,k).getRegex(),be=/[\p{Pi}\p{Ps}"']/u,xe=/(?!~)[\p{P}\p{S}]/u,Se=/(?!~)[\s\p{P}\p{S}]/u,Ce=/(?:[^\s\p{P}\p{S}]|~)/u,we=g(/link|precode-code|html/,`g`).replace(`link`,/\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace(`precode-`,_?"(?<!`)()":"(^^|[^`])").replace(`code`,/(?<b>`+)[^`]+\k<b>(?!`)/).replace(`html`,/<(?! )[^<>]*?>/).getRegex(),Te=/^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/,Ee=g(Te,`u`).replace(/punct/g,O).getRegex(),De=g(Te,`u`).replace(/punct/g,xe).getRegex(),Oe=g(/^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/,`u`).replace(/openQuote/g,be).replace(/punct/g,O).getRegex(),ke=`^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)`,Ae=g(ke,`gu`).replace(/notPunctSpace/g,A).replace(/punctSpace/g,k).replace(/punct/g,O).getRegex(),je=g(ke,`gu`).replace(/notPunctSpace/g,Ce).replace(/punctSpace/g,Se).replace(/punct/g,xe).getRegex(),Me=g(`^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)`,`gu`).replace(/notPunctSpace/g,A).replace(/punctSpace/g,k).replace(/punct/g,O).getRegex(),Ne=g(`^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)`,`gu`).replace(/notPunctSpace/g,A).replace(/punctSpace/g,k).replace(/punct/g,O).getRegex(),Pe=g(`^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)`,`gu`).replace(/notPunctSpace/g,A).replace(/punctSpace/g,k).replace(/punct/g,O).getRegex(),Fe=g(/^~~?(?:((?!~)punct)|[^\s~])/,`u`).replace(/punct/g,O).getRegex(),Ie=g(`^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)`,`gu`).replace(/notPunctSpace/g,A).replace(/punctSpace/g,k).replace(/punct/g,O).getRegex(),Le=g(/\\(punct)/,`gu`).replace(/punct/g,O).getRegex(),Re=g(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/,`gu`).replace(/punct/g,O).getRegex(),ze=g(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace(`scheme`,/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace(`email`,/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Be=g(E).replace(`(?:-->|$)`,`-->`).getRegex(),Ve=g(`^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>`).replace(`comment`,Be).replace(`attribute`,/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),He=/\[(?:\\[\s\S]|[^\[\]\\])*\]/,j=g(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace(`brackets`,He).getRegex(),Ue=g(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/).replace(`label`,j).replace(`href`,/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace(`title`,/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),We=g(/^!?\[(label)\]\[(ref)\]/).replace(`label`,j).replace(`ref`,w).getRegex(),Ge=g(/^!?\[(ref)\](?:\[\])?/).replace(`ref`,w).getRegex(),Ke=/(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/,qe=g(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace(`brackets`,He).getRegex(),Je=g(`reflink|nolink(?!\\()`,`g`).replace(`reflink`,g(/^!?\[(label)\]\[(ref)\]/).replace(`label`,qe).replace(`ref`,Ke).getRegex()).replace(`nolink`,g(/^!?\[(ref)\](?:\[\])?/).replace(`ref`,Ke).getRegex()).getRegex(),Ye=/[hH][tT][tT][pP][sS]?|[fF][tT][pP]/,Xe=g(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g,/[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(),M={_backpedal:m,anyPunctuation:Le,anyPunctuationOutsideCode:Re,autolink:ze,blockSkip:we,br:_e,code:ge,del:m,delLDelim:m,delRDelim:m,emStrongLDelim:Ee,emStrongRDelimAst:Ae,emStrongRDelimUnd:Ne,escape:he,link:Ue,nolink:Ge,punctuation:ye,reflink:We,reflinkSearch:Je,tag:Ve,text:ve,url:m},Ze={...M,emStrongLDelim:Oe,emStrongRDelimAst:Me,emStrongRDelimUnd:Pe,link:g(/^!?\[(label)\]\((.*?)\)/).replace(`label`,j).getRegex(),reflink:g(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace(`label`,j).getRegex()},N={...M,emStrongRDelimAst:je,emStrongLDelim:De,delLDelim:Fe,delRDelim:Ie,url:g(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace(`emailProtocol`,Xe).replace(`protocol`,Ye).replace(`email`,/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/,text:g(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/).replace(`protocol`,Ye).replace(/emailProtocol/g,/(?:mailto|xmpp):/).getRegex()},Qe={...N,br:g(_e).replace(`{2,}`,`*`).getRegex(),text:g(N.text).replace(`\\b_`,`\\b_| {2,}\\n`).replace(/\{2,\}/g,`*`).getRegex()},P={normal:D,gfm:pe,pedantic:me},F={normal:M,gfm:N,breaks:Qe,pedantic:Ze},$e={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`},et=e=>$e[e];function I(e,t){if(t){if(v.escapeTest.test(e))return e.replace(v.escapeReplace,et)}else if(v.escapeTestNoEncode.test(e))return e.replace(v.escapeReplaceNoEncode,et);return e}function tt(e){return v.numericCharacterReference.test(e)?e.replace(v.numericCharacterReferenceOrAmpersand,(e,t,n)=>{if(t===void 0&&n===void 0)return`&amp;`;let r=t===void 0?Number.parseInt(n,16):Number.parseInt(t,10);return r===0||r>1114111||r>=55296&&r<=57343?`�`:r===38?`&amp;`:String.fromCodePoint(r)}):e}function nt(e){try{e=encodeURI(e).replace(v.percentDecode,`%`)}catch{return null}return e}function rt(e,t){let n=e.replace(v.findPipe,(e,t,n)=>{let r=!1,i=t;for(;--i>=0&&n[i]===`\\`;)r=!r;return r?`|`:` |`}).split(v.splitPipe),r=0;if(n[0].trim()||n.shift(),n.length>0&&!n.at(-1)?.trim()&&n.pop(),t){if(n.length>t)n.splice(t);else for(;n.length<t;)n.push(``)}for(;r<n.length;r++)n[r]=n[r].trim().replace(v.slashPipe,`|`);return n}function L(e,t,n){let r=e.length;if(r===0)return``;let i=0;for(;i<r;){let a=e.charAt(r-i-1);if(a===t&&!n)i++;else if(a!==t&&n)i++;else break}return e.slice(0,r-i)}function it(e){let t=e.split(`
`),n=t.length-1;for(;n>=0&&v.blankLine.test(t[n]);)n--;return t.length-n<=2?e:t.slice(0,n+1).join(`
`)}function R(e){return e.trim().toLowerCase().toUpperCase().toLowerCase()}function at(e,t){if(e.indexOf(t[0])===-1&&e.indexOf(t[1])===-1)return-1;let n=0;for(let r=0;r<e.length;r++)if(e[r]===`\\`)r++;else if(e[r]===t[0])n++;else if(e[r]===t[1]&&(n--,n<0))return r;return n>0?-2:-1}function z(e,t=0){let n=t,r=``;for(let t of e)if(t===`	`){let e=4-n%4;r+=` `.repeat(e),n+=e}else r+=t,n++;return r}function ot(e,t,n,r,i){let a=t.href,o=t.title||null,s=e[1].replace(i.other.outputLinkReplace,`$1`),c=e[0].charAt(0)===`!`,l=r.state.inLink,u=r.state.linkEmitted,d=r.state.inRawBlock;r.state.inLink=!0,r.state.linkEmitted=!1;let f=r.inlineTokens(s),p=r.state.linkEmitted;if(r.state.linkEmitted=u,r.state.inLink=l,!c){if(p){r.state.inRawBlock=d;return}r.state.linkEmitted=!0}return{type:c?`image`:`link`,raw:n,href:a,title:o,text:s,tokens:f}}function st(e,t,n){let r=e.match(n.other.indentCodeCompensation);if(r===null)return t;let i=r[1];return t.split(`
`).map(e=>{let t=e.match(n.other.beginningSpace);if(t===null)return e;let[r]=t;return e.slice(Math.min(r.length,i.length))}).join(`
`)}function ct(e,t,n,r){if(!t.includes(`<`))return!1;for(let i=0;i<t.length;i++){if(t[i]===`\\`){i++;continue}if(t[i]==="`"){let e=r.inline.code.exec(t.slice(i));if(e){i+=e[0].length-1;continue}}if(t[i]!==`<`)continue;let a=e.slice(n+i),o=r.inline.tag.exec(a)||r.inline.autolink.exec(a);if(o){if(o[0].length>t.length-i)return!0;i+=o[0].length-1}}return!1}var B=class{options;rules;lexer;constructor(e){this.options=e||f}space(e){let t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:`space`,raw:t[0]}}code(e){let t=this.rules.block.code.exec(e);if(t){let e=this.options.pedantic?t[0]:it(t[0]);return{type:`code`,raw:e,codeBlockStyle:`indented`,text:e.replace(this.rules.other.codeRemoveIndent,``)}}}fences(e){let t=this.rules.block.fences.exec(e);if(t){let e=t[0],n=st(e,t[3]||``,this.rules);return{type:`code`,raw:e,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,`$1`):t[2],text:n}}}heading(e){let t=this.rules.block.heading.exec(e);if(t){let e=t[2].trim();if(this.rules.other.endingHash.test(e)){let t=L(e,`#`);(this.options.pedantic||!t||this.rules.other.endingSpaceTabChar.test(t))&&(e=t.trim())}return{type:`heading`,raw:L(t[0],`
`),depth:t[1].length,text:e,tokens:this.lexer.inline(e)}}}hr(e){let t=this.rules.block.hr.exec(e);if(t)return{type:`hr`,raw:L(t[0],`
`)}}blockquote(e){let t=this.rules.block.blockquote.exec(e);if(t){let e=L(t[0],`
`).split(`
`),n=``,r=``,i=[];for(;e.length>0;){let t=!1,a=[],o=0;for(;o<e.length;o++)if(this.rules.other.blockquoteStart.test(e[o]))a.push(e[o]),t=!0;else if(!t)a.push(e[o]);else break;e=e.slice(o);let s=a.join(`
`),c=s.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,``);n=n?`${n}
${s}`:s,r=r?`${r}
${c}`:c;let l=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(c,i,!0),this.lexer.state.top=l,e.length===0)break;let u=i.at(-1);if(u?.type===`code`||u?.type===`heading`||u?.type===`hr`||u?.type===`html`)break;if(u?.type===`blockquote`){let t=u,a=e.join(`
`),o=t.raw+`
`+a.replace(this.rules.other.blockquoteSetextReplace2,``),s=this.blockquote(o);i[i.length-1]=s;let c=o.substring(s.raw.length).replace(/^\n/,``),l=c?c.split(`
`).length:0,d=l?e.slice(0,-l):e;d.length>0&&(n=`${n}
${d.join(`
`)}`),r=r.substring(0,r.length-t.text.length)+s.text;break}if(u?.type===`list`){let t=u,a=t.raw+`
`+e.join(`
`),o=this.list(a);i[i.length-1]=o,n=n.substring(0,n.length-u.raw.length)+o.raw,r=r.substring(0,r.length-t.raw.length)+o.raw,e=a.substring(i.at(-1).raw.length).split(`
`)}}return{type:`blockquote`,raw:n,tokens:i,text:r}}}list(e){let t=this.rules.block.list.exec(e);if(t){let n=e,r=()=>n.length-e.length,i=t[1].trim(),a=i.length>1,o={type:`list`,raw:``,ordered:a,start:a?+i.slice(0,-1):``,loose:!1,items:[]};i=a?`\\d{1,9}\\${i.slice(-1)}`:`\\${i}`,this.options.pedantic&&(i=a?i:`[*+-]`);let s=this.rules.other.listItemRegex(i),c=!1;for(;e;){let i=!1,a=``;if(!(t=s.exec(e))||this.rules.block.hr.test(e))break;let l=r();e=e.substring(t[0].length);let u=t[2].split(`
`,1)[0],d=t[1].length,f=this.options.pedantic?z(u,d):u.replace(this.rules.other.leadingSpaceTab,e=>z(e,d)),p=e.split(`
`,1)[0],m=!f.trim(),h=0;if(this.options.pedantic?(h=2,a=f.trimStart()):m?h=d+1:(h=f.search(this.rules.other.nonSpaceChar),h=h>4?1:h,a=f.slice(h),h+=d),m&&this.rules.other.blankLine.test(p)&&(e=e.substring(p.length+1),i=!0),!i){let t=this.rules.other.nextBulletRegex(h),n=this.rules.other.hrRegex(h),r=this.rules.other.fencesBeginRegex(h),i=this.rules.other.headingBeginRegex(h),o=this.rules.other.htmlBeginRegex(h),s=this.rules.other.blockquoteBeginRegex(h);for(;e;){let c=e.split(`
`,1)[0],l;if(p=c,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,`  `),l=p):l=p.replace(this.rules.other.leadingSpaceTab,e=>z(e)),r.test(p)||i.test(p)||o.test(p)||s.test(p)||t.test(p)||n.test(p))break;if(l.search(this.rules.other.nonSpaceChar)>=h||!p.trim())a+=`
`+l.slice(h);else{if(m||f.replace(this.rules.other.tabCharGlobal,`    `).search(this.rules.other.nonSpaceChar)>=4||r.test(f)||i.test(f)||n.test(f))break;a+=`
`+p}m=!p.trim(),e=e.substring(c.length+1),f=l.slice(h)}}let g=n.slice(l,r());o.loose||(c?o.loose=!0:this.rules.other.doubleBlankLine.test(g)&&(c=!0)),o.items.push({type:`list_item`,raw:g,task:!!this.options.gfm&&this.rules.other.listIsTask.test(a),loose:!1,text:a,tokens:[]})}let l=o.items.at(-1);if(l)l.raw=l.raw.trimEnd(),l.text=l.text.trimEnd();else return;o.raw=n.slice(0,r()).trimEnd();for(let e of o.items)if(this.lexer.state.top=!1,e.tokens=this.lexer.blockTokens(e.text,[]),!o.loose){let t=e.tokens.filter(e=>e.type===`space`);o.loose=t.length>0&&t.some(e=>this.rules.other.anyLine.test(e.raw))}for(let e of o.items){let t=e.tokens[0];if(e.task&&(t?.type===`text`||t?.type===`paragraph`)){e.text=e.text.replace(this.rules.other.listReplaceTask,``),t.raw=t.raw.replace(this.rules.other.listReplaceTask,``),t.text=t.text.replace(this.rules.other.listReplaceTask,``);for(let e=this.lexer.inlineQueue.length-1;e>=0;e--)if(this.rules.other.listIsTask.test(this.lexer.inlineQueue[e].src)){this.lexer.inlineQueue[e].src=this.lexer.inlineQueue[e].src.replace(this.rules.other.listReplaceTask,``);break}let n=this.rules.other.listTaskCheckbox.exec(e.raw);if(n){let t={type:`checkbox`,raw:n[0]+` `,checked:n[0]!==`[ ]`};e.checked=t.checked,o.loose?e.tokens[0]&&[`paragraph`,`text`].includes(e.tokens[0].type)&&`tokens`in e.tokens[0]&&e.tokens[0].tokens?(e.tokens[0].raw=t.raw+e.tokens[0].raw,e.tokens[0].text=t.raw+e.tokens[0].text,e.tokens[0].tokens.unshift(t)):e.tokens.unshift({type:`paragraph`,raw:t.raw,text:t.raw,tokens:[t]}):e.tokens.unshift(t)}}else e.task&&=!1}if(o.loose)for(let e of o.items){e.loose=!0;for(let t of e.tokens)t.type===`text`&&(t.type=`paragraph`)}return o}}html(e){let t=this.rules.block.html.exec(e);if(t){let e=it(t[0]);return{type:`html`,block:!0,raw:e,pre:t[1]===`pre`||t[1]===`script`||t[1]===`style`,text:e}}}def(e){let t=this.rules.block.def.exec(e);if(t){if(!this.rules.other.startAngleBracket.test(t[2])&&at(t[2],`()`)!==-1)return;let e=R(t[1]).replace(this.rules.other.multipleSpaceGlobal,` `),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,`$1`).replace(this.rules.inline.anyPunctuation,`$1`):``,r=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,`$1`):t[3];return{type:`def`,tag:e,raw:L(t[0],`
`),href:n,title:r}}}table(e){let t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;let n=rt(t[1]),r=t[2].replace(this.rules.other.tableAlignChars,``).split(`|`),i=t[3]?.trim()?t[3].replace(this.rules.other.tableRowBlankLine,``).split(`
`):[],a={type:`table`,raw:L(t[0],`
`),header:[],align:[],rows:[]};if(n.length===r.length){for(let e of r)this.rules.other.tableAlignRight.test(e)?a.align.push(`right`):this.rules.other.tableAlignCenter.test(e)?a.align.push(`center`):this.rules.other.tableAlignLeft.test(e)?a.align.push(`left`):a.align.push(null);for(let e=0;e<n.length;e++)a.header.push({text:n[e],tokens:this.lexer.inline(n[e]),header:!0,align:a.align[e]});for(let e of i)a.rows.push(rt(e,a.header.length).map((e,t)=>({text:e,tokens:this.lexer.inline(e),header:!1,align:a.align[t]})));return a}}lheading(e){let t=this.rules.block.lheading.exec(e);if(t){let e=t[1].trim();return{type:`heading`,raw:L(t[0],`
`),depth:t[2].charAt(0)===`=`?1:2,text:e,tokens:this.lexer.inline(e)}}}paragraph(e){let t=this.rules.block.paragraph.exec(e);if(t){let e=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:`paragraph`,raw:t[0],text:e,tokens:this.lexer.inline(e)}}}text(e){let t=this.rules.block.text.exec(e);if(t)return{type:`text`,raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){let t=this.rules.inline.escape.exec(e);if(t)return{type:`escape`,raw:t[0],text:t[1]}}tag(e){let t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:`html`,raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){if(this.lexer.state.linkParenPossible===!1)return;let t=this.rules.inline.link.exec(e);if(t){let n=t[0].charAt(0)===`!`?2:1;if(!this.options.pedantic&&ct(e,t[1],n,this.rules))return;let r=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(r)){if(!this.rules.other.endAngleBracket.test(r))return;let e=L(r.slice(0,-1),`\\`);if((r.length-e.length)%2==0)return}else{let e=at(t[2],`()`);if(e===-2)return;if(e>-1){let n=(t[0].indexOf(`!`)===0?5:4)+t[1].length+e;t[2]=t[2].substring(0,e),t[0]=t[0].substring(0,n).trim(),t[3]=``}}let i=t[2],a=``;if(this.options.pedantic){let e=this.rules.other.pedanticHrefTitle.exec(i);e&&(i=e[1],a=e[3])}else a=t[3]?t[3].slice(1,-1):``;return i=i.trim(),this.rules.other.startAngleBracket.test(i)&&(i=this.options.pedantic&&!this.rules.other.endAngleBracket.test(r)?i.slice(1):i.slice(1,-1)),ot(t,{href:i&&i.replace(this.rules.inline.anyPunctuation,`$1`),title:a&&a.replace(this.rules.inline.anyPunctuation,`$1`)},t[0],this.lexer,this.rules)}}reflink(e,t){let n;if((n=this.rules.inline.reflink.exec(e))||(n=this.rules.inline.nolink.exec(e))){let r=n[0].charAt(0)===`!`?2:1;if(!this.options.pedantic&&ct(e,n[1],r,this.rules))return;let i=t[R((n[2]||n[1]).replace(this.rules.other.multipleSpaceGlobal,` `))];if(!i){let e=n[0].charAt(0);return{type:`text`,raw:e,text:e}}return ot(n,i,n[0],this.lexer,this.rules)}}emStrong(e,t,n=``){let r=this.rules.inline.emStrongLDelim.exec(e);if(!(!r||!r[1]&&!r[2]&&!r[3]&&!r[4]||r[4]&&n.match(this.rules.other.unicodeAlphaNumeric))&&(!(r[1]||r[3])||!n||this.rules.inline.punctuation.exec(n))){let i=[...r[0]].length-1,a,o,s=i,c=0,l=r[0][0],u=n===l,d=l===`*`?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(r=d.exec(t))!==null;){if(a=r[1]||r[2]||r[3]||r[4]||r[5]||r[6],!a)continue;if(o=[...a].length,r[3]||r[4]){s+=o;continue}if(r[5]||r[6]){if(i%3&&!((i+o)%3)){c+=o;continue}if(u)break}if(s-=o,s>0)continue;o=Math.min(o,o+s+c);let t=[...r[0]][0].length,n=e.slice(0,i+r.index+t+o);if(Math.min(i,o)%2){let e=n.slice(1,-1);return{type:`em`,raw:n,text:e,tokens:this.lexer.inlineTokens(e)}}let l=n.slice(2,-2);return{type:`strong`,raw:n,text:l,tokens:this.lexer.inlineTokens(l)}}}}codespan(e){let t=this.rules.inline.code.exec(e);if(t){let e=t[2].replace(this.rules.other.newLineCharGlobal,` `),n=this.rules.other.nonSpaceChar.test(e),r=this.rules.other.startingSpaceChar.test(e)&&this.rules.other.endingSpaceChar.test(e);return n&&r&&(e=e.substring(1,e.length-1)),{type:`codespan`,raw:t[0],text:e}}}br(e){let t=this.rules.inline.br.exec(e);if(t)return{type:`br`,raw:t[0]}}del(e,t,n=``){let r=this.rules.inline.delLDelim.exec(e);if(r&&(!r[1]||!n||this.rules.inline.punctuation.exec(n))){let n=[...r[0]].length-1,i,a,o=n,s=this.rules.inline.delRDelim;for(s.lastIndex=0,t=t.slice(-1*e.length+n);(r=s.exec(t))!==null;){if(i=r[1]||r[2]||r[3]||r[4]||r[5]||r[6],!i||(a=[...i].length,a!==n))continue;if(r[3]||r[4]){o+=a;continue}if(o-=a,o>0)continue;a=Math.min(a,a+o);let t=[...r[0]][0].length,s=e.slice(0,n+r.index+t+a),c=s.slice(n,-n);return{type:`del`,raw:s,text:c,tokens:this.lexer.inlineTokens(c)}}}}autolink(e){let t=this.rules.inline.autolink.exec(e);if(t){let e,n;return t[2]===`@`?(e=t[1],n=`mailto:`+e):(e=t[1],n=e),{type:`link`,raw:t[0],text:e,href:n,autolink:!0,tokens:[{type:`text`,raw:e,text:e}]}}}url(e){let t;if(t=this.rules.inline.url.exec(e)){let e,n;if(t[2]===`@`)e=t[0],n=`mailto:`+e;else{let r;do r=t[0],t[0]=this.rules.inline._backpedal.exec(t[0])?.[0]??``;while(r!==t[0]);e=t[0],n=t[1]===`www.`?`http://`+t[0]:t[0]}return{type:`link`,raw:t[0],text:e,href:n,autolink:!0,tokens:[{type:`text`,raw:e,text:e}]}}}inlineText(e){let t=this.rules.inline.text.exec(e);if(t){let e=this.lexer.state.inRawBlock;return{type:`text`,raw:t[0],text:e?t[0]:tt(t[0]),escaped:e}}}},V=class e{tokens;options;state;inlineQueue;tokenizer;constructor(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||f,this.options.tokenizer=this.options.tokenizer||new B,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,linkEmitted:!1,linkParenPossible:!0,top:!0};let t={other:v,block:P.normal,inline:F.normal};this.options.pedantic?(t.block=P.pedantic,t.inline=F.pedantic):this.options.gfm&&(t.block=P.gfm,t.inline=this.options.breaks?F.breaks:F.gfm),this.tokenizer.rules=t}static get rules(){return{block:P,inline:F}}static lex(t,n){return new e(n).lex(t)}static lexInline(t,n){return new e(n).inlineTokens(t)}lex(e){e=e.replace(v.carriageReturn,`
`),this.blockTokens(e,this.tokens);for(let e=0;e<this.inlineQueue.length;e++){let t=this.inlineQueue[e];this.inlineTokens(t.src,t.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(e,t=[],n=!1){this.tokenizer.lexer=this,this.options.pedantic&&(e=e.replace(v.tabCharGlobal,`    `).replace(v.spaceLine,``));let r=1/0;for(;e;){if(e.length<r)r=e.length;else{this.infiniteLoopError(e.charCodeAt(0));break}let i;if(this.options.extensions?.block?.some(n=>(i=n.call({lexer:this},e,t))?(e=e.substring(i.raw.length),t.push(i),!0):!1))continue;if(i=this.tokenizer.space(e)){e=e.substring(i.raw.length);let n=t.at(-1);i.raw.length===1&&n!==void 0?n.raw+=`
`:t.push(i);continue}if(i=this.tokenizer.code(e)){e=e.substring(i.raw.length);let n=t.at(-1);n?.type===`paragraph`||n?.type===`text`?(n.raw+=(n.raw.endsWith(`
`)?``:`
`)+i.raw,n.text+=`
`+i.text,this.inlineQueue.at(-1).src=n.text):t.push(i);continue}if((i=this.tokenizer.fences(e))||(i=this.tokenizer.heading(e))||(i=this.tokenizer.hr(e))||(i=this.tokenizer.blockquote(e))||(i=this.tokenizer.list(e))||(i=this.tokenizer.html(e))){e=e.substring(i.raw.length),t.push(i);continue}if(i=this.tokenizer.def(e)){e=e.substring(i.raw.length);let n=t.at(-1);n?.type===`paragraph`||n?.type===`text`?(n.raw+=(n.raw.endsWith(`
`)?``:`
`)+i.raw,n.text+=`
`+i.raw,this.inlineQueue.at(-1).src=n.text):this.tokens.links[i.tag]||(this.tokens.links[i.tag]={href:i.href,title:i.title},t.push(i));continue}if((i=this.tokenizer.table(e))||(i=this.tokenizer.lheading(e))){e=e.substring(i.raw.length),t.push(i);continue}let a=e;if(this.options.extensions?.startBlock){let t=1/0,n=e.slice(1),r;this.options.extensions.startBlock.forEach(e=>{r=e.call({lexer:this},n),typeof r==`number`&&r>=0&&(t=Math.min(t,r))}),t<1/0&&t>=0&&(a=e.substring(0,t+1))}if(this.state.top&&(i=this.tokenizer.paragraph(a))){let r=t.at(-1);n&&r?.type===`paragraph`?(r.raw+=(r.raw.endsWith(`
`)?``:`
`)+i.raw,r.text+=`
`+i.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=r.text):t.push(i),n=a.length!==e.length,e=e.substring(i.raw.length)}else if(i=this.tokenizer.text(e)){e=e.substring(i.raw.length);let n=t.at(-1);n?.type===`text`?(n.raw+=(n.raw.endsWith(`
`)?``:`
`)+i.raw,n.text+=`
`+i.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=n.text):t.push(i)}else if(e){this.infiniteLoopError(e.charCodeAt(0));break}}return this.state.top=!0,t}inline(e,t=[]){return this.inlineQueue.push({src:e,tokens:t}),t}linkInText(e){if(!e.includes(`[`))return!1;let t=this.tokenizer.rules.inline.link;for(let n of e.matchAll(this.tokenizer.rules.inline.blockSkip))if(t.test(n[0])&&e.charAt(n.index-1)!==`!`)return!0;for(let t of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)){let e=t[0],n=e.lastIndexOf(`[`);if(e.charAt(0)!==`!`&&Object.hasOwn(this.tokens.links,R(e.slice(n+1,-1)))&&!(n>1&&this.linkInText(e.slice(1,n-1))))return!0}return!1}inlineTokens(e,t=[]){this.tokenizer.lexer=this;let n=this.state.linkParenPossible;this.state.linkParenPossible=n&&e.includes(`)`);try{return this.#e(e,t)}finally{this.state.linkParenPossible=n}}#e(e,t){let n=e;if(this.tokens.links&&e.includes(`[`)){let e=this.tokenizer.rules.inline.reflinkSearch,t=n=>{let r=n.lastIndexOf(`[`);if(!Object.hasOwn(this.tokens.links,R(n.slice(r+1,-1))))return n;if(r>1&&n.charAt(0)!==`!`){let i=n.slice(1,r-1);if(this.linkInText(i))return`[`+i.replace(e,t)+`][`+`a`.repeat(n.length-r-2)+`]`}return`[`+`a`.repeat(n.length-2)+`]`};n=n.replace(e,t)}n=n.replace(this.tokenizer.rules.inline.anyPunctuationOutsideCode,(e,t,n)=>n?`+`.repeat(e.length):t?t+e.slice(t.length,-t.length).replace(/`/g,`+`)+t:e),n=n.replace(this.tokenizer.rules.inline.blockSkip,(e,t,n)=>{let r=n?n.length:0;return e.slice(0,r)+`[`+`a`.repeat(e.length-r-2)+`]`}),n=this.options.hooks?.emStrongMask?.call({lexer:this},n)??n;let r=!1,i=``,a=1/0;for(;e;){if(e.length<a)a=e.length;else{this.infiniteLoopError(e.charCodeAt(0));break}r||(i=``),r=!1;let o;if(this.options.extensions?.inline?.some(n=>(o=n.call({lexer:this},e,t))?(e=e.substring(o.raw.length),t.push(o),!0):!1))continue;if((o=this.tokenizer.escape(e))||(o=this.tokenizer.tag(e))||(o=this.tokenizer.link(e))){e=e.substring(o.raw.length),t.push(o);continue}if(o=this.tokenizer.reflink(e,this.tokens.links)){e=e.substring(o.raw.length);let n=t.at(-1);o.type===`text`&&n?.type===`text`?(n.raw+=o.raw,n.text+=o.text):t.push(o);continue}if((o=this.tokenizer.emStrong(e,n,i))||(o=this.tokenizer.codespan(e))||(o=this.tokenizer.br(e))||(o=this.tokenizer.del(e,n,i))||(o=this.tokenizer.autolink(e))||!this.state.inLink&&(o=this.tokenizer.url(e))){e=e.substring(o.raw.length),t.push(o);continue}let s=e;if(this.options.extensions?.startInline){let t=1/0,n=e.slice(1),r;this.options.extensions.startInline.forEach(e=>{r=e.call({lexer:this},n),typeof r==`number`&&r>=0&&(t=Math.min(t,r))}),t<1/0&&t>=0&&(s=e.substring(0,t+1))}if(o=this.tokenizer.inlineText(s)){e=e.substring(o.raw.length),o.raw.slice(-1)!==`_`&&(i=o.raw.slice(-1)),r=!0;let n=t.at(-1);n?.type===`text`?(n.raw+=o.raw,n.text+=o.text):t.push(o)}else if(e){this.infiniteLoopError(e.charCodeAt(0));break}}return t}infiniteLoopError(e){let t=`Infinite loop on byte: `+e;if(this.options.silent)console.error(t);else throw Error(t)}},H=class{options;parser;constructor(e){this.options=e||f}space(e){return``}code({text:e,lang:t,escaped:n}){let r=(t||``).match(v.notSpaceStart)?.[0],i=e?e.replace(v.endingNewline,``)+`
`:``;return r?`<pre><code class="language-`+I(r)+`">`+(n?i:I(i,!0))+`</code></pre>
`:`<pre><code>`+(n?i:I(i,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}def(e){return``}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){let t=e.ordered,n=e.start,r=``;for(let t=0;t<e.items.length;t++){let n=e.items[t];r+=this.listitem(n)}let i=t?`ol`:`ul`,a=t&&n!==1?` start="`+n+`"`:``;return`<`+i+a+`>
`+r+`</`+i+`>
`}listitem(e){return`<li>${this.parser.parse(e.tokens)}</li>
`}checkbox({checked:e}){return`<input `+(e?`checked="" `:``)+`disabled="" type="checkbox"> `}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t=``,n=``;for(let t=0;t<e.header.length;t++)n+=this.tablecell(e.header[t]);t+=this.tablerow({text:n});let r=``;for(let t=0;t<e.rows.length;t++){let i=e.rows[t];n=``;for(let e=0;e<i.length;e++)n+=this.tablecell(i[e]);r+=this.tablerow({text:n})}return r&&=`<tbody>${r}</tbody>`,`<table>
<thead>
`+t+`</thead>
`+r+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){let t=this.parser.parseInline(e.tokens),n=e.header?`th`:`td`;return(e.align?`<${n} align="${e.align}">`:`<${n}>`)+t+`</${n}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${I(e,!0)}</code>`}br(e){return`<br>`}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,text:n,tokens:r,autolink:i}){let a=i?I(n,!0):this.parser.parseInline(r),o=nt(e);if(o===null)return a;e=I(o,i);let s=`<a href="`+e+`"`;return t&&(s+=` title="`+I(t)+`"`),s+=`>`+a+`</a>`,s}image({href:e,title:t,text:n,tokens:r}){r&&(n=this.parser.parseInline(r,this.parser.textRenderer));let i=nt(e);if(i===null)return I(n);e=i;let a=`<img src="${I(e)}" alt="${I(n)}"`;return t&&(a+=` title="${I(t)}"`),a+=`>`,a}text(e){return`tokens`in e&&e.tokens?this.parser.parseInline(e.tokens):`escaped`in e&&e.escaped?e.text:I(e.text)}},U=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return``+e}image({text:e}){return``+e}br(){return``}checkbox({raw:e}){return e}},W=class e{options;renderer;textRenderer;constructor(e){this.options=e||f,this.options.renderer=this.options.renderer||new H,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new U}static parse(t,n){return new e(n).parse(t)}static parseInline(t,n){return new e(n).parseInline(t)}parse(e){this.renderer.parser=this;let t=``;for(let n=0;n<e.length;n++){let r=e[n];if(this.options.extensions?.renderers?.[r.type]){let e=r,n=this.options.extensions.renderers[e.type].call({parser:this},e);if(n!==!1||![`space`,`hr`,`heading`,`code`,`table`,`blockquote`,`list`,`checkbox`,`html`,`def`,`paragraph`,`text`].includes(e.type)){t+=n||``;continue}}let i=r;switch(i.type){case`space`:t+=this.renderer.space(i);break;case`hr`:t+=this.renderer.hr(i);break;case`heading`:t+=this.renderer.heading(i);break;case`code`:t+=this.renderer.code(i);break;case`table`:t+=this.renderer.table(i);break;case`blockquote`:t+=this.renderer.blockquote(i);break;case`list`:t+=this.renderer.list(i);break;case`checkbox`:t+=this.renderer.checkbox(i);break;case`html`:t+=this.renderer.html(i);break;case`def`:t+=this.renderer.def(i);break;case`paragraph`:t+=this.renderer.paragraph(i);break;case`text`:t+=this.renderer.text(i);break;default:{let e=`Token with "`+i.type+`" type was not found.`;if(this.options.silent)return console.error(e),``;throw Error(e)}}}return t}parseInline(e,t=this.renderer){this.renderer.parser=this;let n=``;for(let r=0;r<e.length;r++){let i=e[r];if(this.options.extensions?.renderers?.[i.type]){let e=this.options.extensions.renderers[i.type].call({parser:this},i);if(e!==!1||![`escape`,`html`,`link`,`image`,`checkbox`,`strong`,`em`,`codespan`,`br`,`del`,`text`].includes(i.type)){n+=e||``;continue}}let a=i;switch(a.type){case`escape`:n+=t.text(a);break;case`html`:n+=t.html(a);break;case`link`:n+=t.link(a);break;case`image`:n+=t.image(a);break;case`checkbox`:n+=t.checkbox(a);break;case`strong`:n+=t.strong(a);break;case`em`:n+=t.em(a);break;case`codespan`:n+=t.codespan(a);break;case`br`:n+=t.br(a);break;case`del`:n+=t.del(a);break;case`text`:n+=t.text(a);break;default:{let e=`Token with "`+a.type+`" type was not found.`;if(this.options.silent)return console.error(e),``;throw Error(e)}}}return n}},G=class{options;block;constructor(e){this.options=e||f}static passThroughHooks=new Set([`preprocess`,`postprocess`,`processAllTokens`,`emStrongMask`]);static passThroughHooksRespectAsync=new Set([`preprocess`,`postprocess`,`processAllTokens`]);preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}emStrongMask(e){return e}provideLexer(e=this.block){return e?V.lex:V.lexInline}provideParser(e=this.block){return e?W.parse:W.parseInline}};function K(e,t){if(Array.isArray(t))for(let n=0;n<t.length;n++)e.push(t[n]);else e.push(t)}var q=new class{defaults=d();options=this.setOptions;parse=this.parseMarkdown(!0);parseInline=this.parseMarkdown(!1);Parser=W;Renderer=H;TextRenderer=U;Lexer=V;Tokenizer=B;Hooks=G;constructor(...e){this.use(...e)}walkTokens(e,t){let n=[];for(let r of e)switch(K(n,t.call(this,r)),r.type){case`table`:{let e=r;for(let r of e.header)K(n,this.walkTokens(r.tokens,t));for(let r of e.rows)for(let e of r)K(n,this.walkTokens(e.tokens,t));break}case`list`:{let e=r;K(n,this.walkTokens(e.items,t));break}default:{let e=r;this.defaults.extensions?.childTokens?.[e.type]?this.defaults.extensions.childTokens[e.type].forEach(r=>{let i=e[r].flat(1/0);K(n,this.walkTokens(i,t))}):e.tokens&&K(n,this.walkTokens(e.tokens,t))}}return n}use(...e){let t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(e=>{let n={...e};if(n.async=this.defaults.async||n.async||!1,e.extensions&&(e.extensions.forEach(e=>{if(!e.name)throw Error(`extension name required`);if(`renderer`in e){let n=t.renderers[e.name];n?t.renderers[e.name]=function(...t){let r=e.renderer.apply(this,t);return r===!1&&(r=n.apply(this,t)),r}:t.renderers[e.name]=e.renderer}if(`tokenizer`in e){if(!e.level||e.level!==`block`&&e.level!==`inline`)throw Error(`extension level must be 'block' or 'inline'`);let n=t[e.level];n?n.unshift(e.tokenizer):t[e.level]=[e.tokenizer],e.start&&(e.level===`block`?t.startBlock?t.startBlock.push(e.start):t.startBlock=[e.start]:e.level===`inline`&&(t.startInline?t.startInline.push(e.start):t.startInline=[e.start]))}`childTokens`in e&&e.childTokens&&(t.childTokens[e.name]=e.childTokens)}),n.extensions=t),e.renderer){let t=this.defaults.renderer||new H(this.defaults);for(let n in e.renderer){if(!(n in t))throw Error(`renderer '${n}' does not exist`);if([`options`,`parser`].includes(n))continue;let r=n,i=e.renderer[r],a=t[r];t[r]=(...e)=>{let n=i.apply(t,e);return n===!1&&(n=a.apply(t,e)),n||``}}n.renderer=t}if(e.tokenizer){let t=this.defaults.tokenizer||new B(this.defaults);for(let n in e.tokenizer){if(!(n in t))throw Error(`tokenizer '${n}' does not exist`);if([`options`,`rules`,`lexer`].includes(n))continue;let r=n,i=e.tokenizer[r],a=t[r];t[r]=(...e)=>{let n=i.apply(t,e);return n===!1&&(n=a.apply(t,e)),n}}n.tokenizer=t}if(e.hooks){let t=this.defaults.hooks||new G;for(let n in e.hooks){if(!(n in t))throw Error(`hook '${n}' does not exist`);if([`options`,`block`].includes(n))continue;let r=n,i=e.hooks[r],a=t[r];t[r]=G.passThroughHooks.has(n)?e=>{if(this.defaults.async&&G.passThroughHooksRespectAsync.has(n))return(async()=>{let n=await i.call(t,e);return a.call(t,n)})();let r=i.call(t,e);return a.call(t,r)}:(...e)=>{if(this.defaults.async)return(async()=>{let n=await i.apply(t,e);return n===!1&&(n=await a.apply(t,e)),n})();let n=i.apply(t,e);return n===!1&&(n=a.apply(t,e)),n}}n.hooks=t}if(e.walkTokens){let t=this.defaults.walkTokens,r=e.walkTokens;n.walkTokens=function(e){let n=[];return n.push(r.call(this,e)),t&&K(n,t.call(this,e)),n}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return V.lex(e,t??this.defaults)}parser(e,t){return W.parse(e,t??this.defaults)}parseMarkdown(e){return(t,n)=>{let r={...n},i={...this.defaults,...r},a=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&r.async===!1)return a(Error(`marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise.`));if(typeof t>`u`||t===null)return a(Error(`marked(): input parameter is undefined or null`));if(typeof t!=`string`)return a(Error(`marked(): input parameter is of type `+Object.prototype.toString.call(t)+`, string expected`));if(i.hooks&&(i.hooks.options=i,i.hooks.block=e),i.async)return(async()=>{let n=i.hooks?await i.hooks.preprocess(t):t,r=await(i.hooks?await i.hooks.provideLexer(e):e?V.lex:V.lexInline)(n,i),a=i.hooks?await i.hooks.processAllTokens(r):r;i.walkTokens&&await Promise.all(this.walkTokens(a,i.walkTokens));let o=await(i.hooks?await i.hooks.provideParser(e):e?W.parse:W.parseInline)(a,i);return i.hooks?await i.hooks.postprocess(o):o})().catch(a);try{i.hooks&&(t=i.hooks.preprocess(t));let n=(i.hooks?i.hooks.provideLexer(e):e?V.lex:V.lexInline)(t,i);i.hooks&&(n=i.hooks.processAllTokens(n)),i.walkTokens&&this.walkTokens(n,i.walkTokens);let r=(i.hooks?i.hooks.provideParser(e):e?W.parse:W.parseInline)(n,i);return i.hooks&&(r=i.hooks.postprocess(r)),r}catch(e){return a(e)}}}onError(e,t){return n=>{if(n.message+=`
Please report this to https://github.com/markedjs/marked.`,e){let e=`<p>An error occurred:</p><pre>`+I(n.message+``,!0)+`</pre>`;return t?Promise.resolve(e):e}if(t)return Promise.reject(n);throw n}}};function J(e,t){return q.parse(e,t)}J.options=J.setOptions=function(e){return q.setOptions(e),J.defaults=q.defaults,p(J.defaults),J},J.getDefaults=d,J.defaults=f;function lt(...e){return q.use(...e),J.defaults=q.defaults,p(J.defaults),J}J.use=lt,J.walkTokens=function(e,t){return q.walkTokens(e,t)},J.parseInline=q.parseInline,J.Parser=W,J.parser=W.parse,J.Renderer=H,J.TextRenderer=U,J.Lexer=V,J.lexer=V.lex,J.Tokenizer=B,J.Hooks=G,J.parse=J,J.options,J.setOptions,J.walkTokens,J.parseInline,W.parse,V.lex;var ut=`# TenTenV の使い方

TenTenV は、ブラウザで遊べるソーシャル VR です。VR ヘッドセット・PC・スマホから、同じワールドに集まって話したり遊んだりできます。

---

## 1. はじめる

### 親サーバーを選ぶ

TenTenV には、誰でも立てられる「親サーバー」がたくさんあります。最初の画面で接続する親サーバーの URL を入れて「接続」を押します。一度使った親サーバーは「前に使った親サーバー」に並び、次からはそのまま入れます（× で一覧から消せます）。

- アカウント・フレンド・ワールドは、親サーバーごとに別々です。
- 親サーバーに利用規約があれば、リンクが出ます。
- 親サーバーを変えるには、設定の「アカウント・サーバー」→「親サーバーを変える」。今いるインスタンスからは出ます。

### ログイン

- **Misskey でログイン**: Misskey のサーバー名（例 \`misskey.io\`）を入れて「ログイン」。Misskey の画面で許可すると戻ってきます。パスワードは親サーバーに送られません。親サーバーが求める権限は「アカウントの情報を読む」だけです。
- **ゲストで入る**: 表示名を入れて「入る」。手軽に試せますが、次のことができません。
  - ワールドの保存データ（芳名帳など）を書く
  - だれもいなくても残るインスタンスを作る
  - 親サーバーの設定によっては、アバターやワールドのアップロード

どちらが使えるかは親サーバーの設定によります。

---

## 2. ホーム画面

左の列のタブで切り替えます。

| タブ | できること |
|---|---|
| ワールド | ワールドを探す（名前・説明・タグ、人気順など）。フレンドがいる場所。ワールドを選ぶと、開いているインスタンスの一覧・新しいインスタンスを作る・お気に入り・ホームにする |
| フレンド | オンラインのフレンドといる場所、参加・参加の申請、届いた申請、ユーザーを探す、最近一緒に遊んだ人 |
| アバター | 標準のアバター（Akane）、自分のアバター（VRM のアップロード）、お気に入り |
| 通知 | フレンド申請・招待・参加の申請など |
| プロフィール | 表示名・自己紹介・リンク（5 つまで）・状態・ひとこと・アイコン |
| 制作 | 自分のワールドの登録・更新 |
| 設定 | 画質・音声・移動・アバター・プライバシー・アカウント |

左下の「ホームへ」で、ホームワールドへ行けます（自分で決めていなければ、親サーバーの標準のホーム）。

### ワールドリンクを共有

ワールドの詳細で「ワールドリンクをコピー」を押すと、ワールドそのもののリンクを共有できます。ワールド内のメニューからもコピーできます。インスタンスがまだなくてもリンクを作れます。

受け取った人はログインせずにワールド名・説明・画像を見られます。参加するときだけログインし、開いているインスタンスへ入るか新しいインスタンスを作ります。非公開ワールドの情報は、制作者と管理者以外には表示されません。別の端末へ共有するときは、親サーバーに外部から到達できる公開 URL を設定してください。

---

## 3. インスタンス

同じワールドでも、部屋（インスタンス）ごとに別の人たちがいます。

### 公開範囲

インスタンスを作るときに選びます。

| 公開範囲 | 入れる人 |
|---|---|
| パブリック | この親サーバーの誰でも |
| フレンド+ | 中にいる人（と作成者）のフレンド |
| フレンド | 作成者のフレンド |
| 招待+ | 中にいる人から招待された人 |
| 招待のみ | 作成者から招待された人 |

- 作成者は人数上限を選べます。インスタンスは空になってから 5 分で消えます。
- 満員のときは「並ぶ」ことができ、空いたら順番に入れます（何番目かが表示されます）。
- 作成者がブロックしている人は入れません。キックされた人は、そのインスタンスに入り直せません。
- 1 人が作れるインスタンスは 10 個までです。

### 招待

- ワールドの中のメニュー「インスタンス」→「招待リンクをコピー」。同じ親サーバーのクライアントで開くと、そのインスタンスに入れます。
- 「フレンドを招待」で、オンラインのフレンドに招待を送れます。
- フレンドのプロフィールの「参加を申請」で、相手に「今いる場所に招待して」と頼めます。

---

## 4. 操作

### PC（キーボード・マウス）

画面をクリックすると、マウスで視点を動かせるようになります（Esc で解除）。

| 操作 | キー |
|---|---|
| 移動 | W A S D・矢印キー |
| 走る | Shift を押しながら |
| ジャンプ | Space |
| しゃがむ（切り替え） | C（寝るポーズのときは起きる） |
| 伏せる（切り替え） | Z |
| 見回す | マウス |
| 押す・つかむ | 左クリック（照準の先の物） |
| 持っている物を離す | もう一度左クリック、または G |
| つかむ・離す | G |
| 持っている物を使う | F・右クリック |
| 持っている物の距離 | マウスホイール |
| メニュー | R・Esc |
| チャット | Enter・T |
| ミュートの切り替え | M |
| Push-to-Talk（設定でオンのとき） | V を押している間だけ話す |
| 三人称視点の切り替え | H |
| リスポーン（出現位置へ戻る） | \` （日本語キーボードでは 半角/全角 キー） |
| 手の形 | Alt（または Shift）＋ 1〜8。Alt ＋ 0 で自動に戻す |

手の形の番号: 1 ふつう、2 グー、3 パー、4 指差し、5 チョキ、6 ロック、7 ピストル、8 いいね。

### ゲームパッド（標準の配置）

| 操作 | ボタン |
|---|---|
| 移動・見回す | 左スティック・右スティック |
| ジャンプ | A |
| しゃがむ | B |
| 使う | X |
| つかむ・離す | Y |
| 押す・つかむ | 右トリガー |
| Push-to-Talk | 左トリガー（押している間） |
| 走る | 左スティックを押し込んでいる間 |
| 三人称視点 | 右スティックを押し込む |
| メニュー | スタート（メニュー）ボタン |
| チャット | セレクト（ビュー）ボタン |
| 手の形 | 十字キーの上・下・左・右（ふつう・グー・パー・指差し） |

### スマホ（タッチ）

| 操作 | やり方 |
|---|---|
| 移動 | 左下の仮想スティック（端まで倒すと走る） |
| 見回す | 画面の右側をなぞる |
| 押す・つかむ | 物をタップ |
| ボタン | 右下の「使う」「ジャンプ」「つかむ」「しゃがむ」 |
| メニュー・マイク | 右上のメニューボタン（三本線）とマイクボタン |
| チャット | 左下の「チャット」 |

### VR（コントローラー）

右利きの設定（既定）の場合です。設定の「利き手」を左にすると移動・旋回・ジャンプ・ミュートなどの割り当てが入れ替わります。メニューの開閉は常に左手の Y です。ボタンの名前は Quest などのコントローラーのものです。

| 操作 | 右手 | 左手 |
|---|---|---|
| スティック | 向きを変える（スナップ 30°・スムーズ） | 移動。少し倒すと通常速度、最大まで倒すと走る速度 |
| スティックを押し込む | しゃがむ（切り替え） | — |
| A / X ボタン | A: ジャンプ | X: ミュートの切り替え |
| B / Y ボタン | B: 割り当てなし | Y: メニュー |
| トリガー | 押す（レイの先・ボタン）、持っている物を使う | 押す・使う |
| グリップ | つかむ（手の近くの物、なければレイの先の物）。離すと置く・投げる | 同じ |

- メニューのボタンやつまみは、コントローラーのビームを向けてトリガーで押せます。振動の強さは設定で変えられます。
- 実際に歩いた分も、アバターが動きます。
- 移動の向きは、設定で「頭」か「手」（移動に使う手のレイの向き）を選べます。
- コントローラーのボタンへの指の触れ方から、アバターの指の形を推定します。VR では手の形が指の形から自動で決まります。
- VR では Push-to-Talk のボタンはありません（ミュートの切り替えを使ってください）。

手の位置は動くのに Y ボタンやスティックが反応しない場合は、SteamVR のダッシュボードを閉じ、SteamVR の設定で「ヘッドセットがアイドル状態のときに VR を一時停止」をオフにしてください。OpenXR セッションに操作の焦点が戻ると、コントローラー入力が有効になります。

### VR（ハンドトラッキング）

対応する機器では、手の関節がそのままアバターの指に反映されます。

- 親指と人差し指でつまむと、トリガーと同じです（押す）。
- 物の近くでつまむとつかみ、指を離すと離します。

---

## 5. ワールドの中のメニュー

PC・スマホでは **R / Esc / 右上のメニューボタン**、VR では **左手の Y** でメニューを開閉します。表情とポーズはメイン画面の別々のクイックリンクから開きます。画面と VR のメニューは同じ 3D の UI です。PC はマウス、スマホはタッチ、VR はコントローラーのビームとトリガーで操作します。中身が長いときは、ホイール・ドラッグでスクロールします。

| タブ | 内容 |
|---|---|
| メイン | ミュート、リスポーン、フルトラ調整、鏡、フェイスミラー、ホームワールド、VR を終える（VR のとき）、退出。チャットは下部の「チャット」から開く |
| メイン → 表情 | アバターのアクション（衣装など）、表情 |
| メイン → ポーズ | 寝るポーズと寝転びの自動判定 |
| 道具 | パーソナルミラー（持って動かせる）、フェイスミラー（位置・大きさ・不透明度・撮影範囲） |
| フレンド | フレンド一覧と、同じ画面内の参加者一覧を切り替え |
| フレンド → 参加者 | 1 人ずつのプロフィール（フレンド申請・招待など）・ミュート・音量・アバターを隠す・重くても表示・ブロック・通報（作成者・モデレーターは「退出させる」も）。つながり方（P2P と往復時間・中継） |
| アバター | 標準のアバター（Akane）、自分のアバター・お気に入りのアバターへの切り替え |
| ワールド | ワールドを探して移動 |
| インスタンス | 公開範囲・定員・作成者・通信の状態・ホスト、招待リンク、フレンドを招待 |
| 通知 | 通知の一覧（承認・参加・招待・消す） |
| 設定 | 設定（ホームと同じ。13 章） |
| デバッグ | 制作者向け: 同期状態・イベント・接続・時計 |

- 文字の入力欄は、キーボードでそのまま打てるほか、「キーボード」ボタンで仮想キーボードも開けます（VR ではこちらを使います）。「かな」にするとローマ字で日本語を入力できます。
- メニューの文字は、ASCII・かな・JIS 第 1 水準の漢字などに対応しています。それ以外の文字（絵文字・まれな漢字）は □ で表示します。
- ワールドが確認や文字の入力を求めたときも、同じ板に出ます。ファイルの選択は VR の中ではできないので、ヘッドセットを外して画面のダイアログから選んでください。

---

## 6. アバター

### 標準のアバター

標準のアバターは **Akane**（作者: 赤山みんと 様、CC0）です。はじめて入ったときはこの姿になります。読み込めないアバターや重すぎるアバター、隠したアバターも、代わりにこの姿で表示します。

### VRM のアップロード

ホームの「アバター」→「VRM をアップロード」。VRM 0.x / 1.0 に対応しています。

- 「このアバターをアップロード・利用する権利があります」に確認してからアップロードします。
- 大きさの上限は親サーバーの設定（既定 100MB）です。
- VRM に書かれた利用条件（作者・使える人・商用利用・再配布・改変・暴力表現・性的表現・クレジット表記・ライセンス）が表示されます。条件を守って使ってください。
- アップロードしたアバターは、アップロードした本人だけが使えます（ほかの人の画面には、その人の姿として表示されます）。
- 「今の見た目をサムネイルに」でサムネイルを作れます。

### 大きさ

設定の「アバター」→「アバターの大きさ」（30〜300%）。大きさはほかの人の画面にも同じように伝わります。

### 衣装・アクション

アバターに拡張定義（衣装の切り替えやアクションメニュー）があれば、メニューの「表情」→「アバターのアクション」に出ます。衣装の状態はほかの人にも見えます。

拡張定義は、自分のアバターの設定で JSON として書けます。書き方は [SDK.md の 10 章](SDK.md#10-アバターの拡張定義) にあります。

### 重いアバター

ほかの人のアバターが重すぎる（ポリゴン 15 万・マテリアル 64・ボーン 600 を超える）と、自分の画面では標準の姿で表示されます。参加者の一覧の「重くても表示」で、その人だけ本来の姿にできます。

---

## 7. 表情・手の形・寝るポーズ

- **表情**: メニューの「表情」で、笑顔・怒り・悲しい・リラックス・驚き・目を閉じるを選べます。「手の形に合わせる」で自動に戻ります。
- **手の形**: グー・パー・チョキなど 8 種類。手の形に合わせて表情が変わります（アバターの拡張定義で変えられます）。VR では指の形から自動で決まります。
- **口の動き**: 声の大きさと高さから、口の形が自動で動きます。まばたきも自動です。
- **寝るポーズ**: 仰向け・うつ伏せ・左向き・右向き・くつろぐ。「起きる」か、移動・ジャンプ・C で起きます。VR では、床に寝転んで頭を傾けたまま 2 秒たつと、自動で寝るポーズになります（設定の「寝転びの自動判定」で切れます）。

---

## 8. 声

- **ミュート**: M キー、画面右上のマイクボタン、VR では左手の X。
- **Push-to-Talk**: 設定の「音声」でオンにすると、PC では V、ゲームパッドでは左トリガーを押している間だけ声が届きます。
- **入ったときはミュート**: 入室時にミュートにしておけます。
- **人ごとの音量**: メニューの「参加者」で 0〜200%。この端末に記録されます。
- **相手をミュート**: 参加者の一覧のスピーカーのボタン。この端末に記録されます。
- **声の聞こえ方**: 相手の頭の位置から聞こえ、離れると小さくなります。「声が届く距離」（既定 25m）で変えられます。
- **ノイズ抑制・エコー除去・音量の自動調整**: ブラウザの機能を使います。マイクの選択とマイクの音量（〜300%）も設定にあります。
- P2P でつながらない相手には、声を圧縮して親サーバー経由で届けます。この中継にはブラウザの WebCodecs が必要です（新しい Chrome・Edge・Firefox・Safari）。

---

## 9. チャット

Enter（または T）で入力し、Enter で送ります。300 文字まで。発言は画面の左下と、相手の頭の上の吹き出しに出ます（吹き出しは設定で消せます）。入力中は相手に「入力中」と伝わります。チャットの履歴は保存されません。

---

## 10. 道具

- **フェイスミラー**: 初期状態でオンになり、自分の顔だけを透明な背景で映します。PC・スマホでは画面の右下、VR では視界の正面から左に 0.30、上に 0.50 移した位置に表示します。表情や口の動きの確認に使え、自分にだけ見えます。「道具」で表示位置、不透明度、PC・スマホと VR それぞれの大きさ・位置、顔の撮影範囲と高さを変えられます。オン・オフと表示設定は端末に保存されます。
- **パーソナルミラー**: 目の前に自分だけに見える鏡を出します。鏡を押すと持って動かせます。VR では鏡面の近くでグリップを握って持ち、離すと置けます。

---

## 11. フレンド・招待・通知

- ホームの「フレンド」でユーザーを名前や \`@ハンドル\` で探し、「フレンド申請」。相手が承認するとフレンドになります。
- フレンドがどこにいるかは、相手の「いる場所を見せる」の設定によって見えます。
- 「参加」でフレンドのいるインスタンスへ、「今いる場所へ招待」で自分のところへ招待できます。
- プロフィールでは、共通のフレンドや公開している作品も見られます。
- 通知には、フレンド申請・承認・招待・参加の申請・招待を断られたこと・お知らせが届きます。
- 状態（オンライン・声をかけて。ログアウト中はオフライン）とひとことを設定できます。

---

## 12. 安全

### 自分を守る

| 機能 | 内容 | 保存先 |
|---|---|---|
| ミュート | その人の声が聞こえなくなる | この端末 |
| アバターを隠す | その人を標準の姿で表示する | この端末 |
| 他の人のアバターをすべて標準の姿にする | 設定の「アバター」 | この端末 |
| ブロック | 互いに見えなくなり、声も届かず、P2P の接続もしない。ブロックした相手は自分が作ったインスタンスに入れない | 親サーバー |
| 通報 | 理由（嫌がらせ・迷惑行為・不適切な内容・不正なクライアント・権利の侵害・そのほか）を選んで、親サーバーの運営者に知らせる | 親サーバー |

インスタンスの作成者とモデレーター（親サーバーの管理者はどこでもモデレーター）は、参加者を退出させられます。

### 許可の設定（設定の「プライバシー・通信」）

| 設定 | 内容 |
|---|---|
| いる場所を見せる | だれでも・フレンド・だれにも |
| 接触を許す | ほかの人の手が自分のアバターの揺れもの（髪・服など）に触れること。「フレンド」にすると、フレンドの手だけが触れます |
| 招待を受ける | だれでも・フレンド・だれにも |
| ホストを引き受けない | バッテリーや回線が弱い端末向け（スマホでは最初からオン） |
| 許可されていないドメインの動画・画像も読み込む | ワールドが許可していないサイトからも読み込む。そのサイトに IP アドレスが送られます |

---

## 13. 設定の一覧

設定は、端末ごとにブラウザに保存されるもの（画質・音・操作など）と、アカウントとして親サーバーに保存されるもの（いる場所・接触・招待）があります。

| 区分 | 主な項目 |
|---|---|
| 画質 | 画質（低・中・高・最高）、描画の解像度、描画距離、視野角、影、アバターを表示する人数と距離、名前・吹き出しの表示、性能の表示 |
| 音声 | マイク、マイクの音量、Push-to-Talk、入ったときはミュート、ノイズ抑制、エコー除去、音量の自動調整、全体の音量、声の音量、声が届く距離 |
| 移動・VR | 旋回（スナップ・スムーズ）と角度・速さ、視野の絞り（酔い対策）、VR の移動の向き、利き手、座って遊ぶ、身長、PC の視点の高さ、マウスの感度、上下の反転、三人称視点、振動の強さ |
| アバター・トラッキング | 大きさ、寝転びの自動判定、他の人を標準アバターに、OSC での表情の受け取り（フェイストラッキング）、フルトラッキング（トラッカーを合わせる） |
| プライバシー・通信 | 12 章の表 |
| アカウント・サーバー | 親サーバーの情報、親サーバーを変える、ログアウト、制作者向けのトークン |
| そのほか | 言語（日本語・English）、保存したファイル（キャッシュ）を消す、この端末の設定を初期値に戻す |

---

## 14. フェイストラッキング・フルトラッキング

### フェイストラッキング（OSC）

表情は **OSC** で受け取ります。設定の「アバター・トラッキング」→「OSC で表情を受け取る」をオンにし、送り手のアプリの送り先をこの PC にします。

- **VMC プロトコル**: \`/VMC/Ext/Blend/Val\` と \`/VMC/Ext/Blend/Apply\`（VSeeFace・iFacialMocap・MeowFace・XR Animator など）。VRM の表情の名前（A・I・U・E・O・Blink・Joy など）か、ARKit の 52 個の名前で送ります。
- **アバターパラメーター**: \`/avatar/parameters/<名前>\`。JawOpen・EyeBlinkLeft などの名前と、v2/JawOpen・v2/EyeLidLeft などの名前に対応します。
- アバターに同じ名前の表情（ARKit の 52 個の名前などの「パーフェクトシンク」）があれば、そのまま動かします。なければ、まばたき・口・笑顔・怒り・悲しい・驚きを VRM の標準の表情に置き換えます。
- **Windows 版**: アプリが UDP を直接受けます。ポートは設定で変えられます（既定 9000。VMC の送り手なら送り先のポートをこれに合わせてください）。
- **ブラウザ**: ブラウザは UDP を受けられないので、PC で \`node scripts/osc-bridge.mjs --port 9000\` を動かします（受けたパケットを \`ws://127.0.0.1:39570\` へ中継します）。
- 扱うのは表情の値だけで、映像は扱いません。相手には表情の値（0〜1）だけが届きます。

### フルトラッキング（Windows 版 + SteamVR）

Windows 版では、SteamVR のトラッカー（Vive トラッカーなど）で腰と両足を動かせます。

1. SteamVR の「コントローラー」→「トラッカーの管理」で、トラッカーの役割を **腰（Waist）・左足（Left Foot）・右足（Right Foot）** にします。
2. TenTenV で VR に入ると「トラッカーを見つけました」と出ます。
3. まっすぐ立って正面を向き、メニューの「トラッカーを合わせる」を押します。

合わせたあとは、腰の向きで体の向きが決まり、足はトラッカーの位置に置かれます。合わせ直すときは、もう一度同じボタンを押します。座ったときと寝転んだときは、トラッカーを使いません。

### SteamVR でのハンドトラッキング

Windows 版では、SteamVR（OpenXR の \`XR_EXT_hand_tracking\`）の指の関節を使います。Valve Index のコントローラーのように、コントローラーを持ったまま指の形が取れる機器では、その指の形をアバターに反映します。ハンドトラッキングだけの機器（Quest を Steam Link でつないだときなど）では、手の関節で押す・つまむ操作ができます。

---

## 15. うまくいかないとき

| こまりごと | 対処 |
|---|---|
| マイクが使えない | ブラウザのアドレスバーのサイトの設定で、マイクを許可します。「マイクの使用が許可されていません」と出たら、許可してからワールドに入り直してください |
| VR ボタンが出ない | WebXR は https のページでしか使えません（localhost は例外）。WebXR に対応したブラウザ（Quest のブラウザなど）で開いてください |
| iPhone で VR にならない | iPhone の Safari は WebXR の VR に対応していないので、画面での操作だけになります |
| 動画が再生されない | \`https://\` で始まる、mp4・webm・m3u8 の直接の URL が必要です。動画のサイトが CORS（ほかのサイトからの読み込みの許可）に対応している必要があります。YouTube などの埋め込み専用の動画は再生できません。ワールドが許可していないドメインは、設定の「許可されていないドメインの動画・画像も読み込む」で読み込めます |
| 音が出ない | 画面を一度クリック（タップ）してください。ブラウザは操作の前に音を出さないことがあります |
| 「サーバー切断」と出る | 親サーバーとの接続が切れています。P2P でつながっている人とはそのまま続けられ、親サーバーが戻ると自動で入り直します |
| ある人が見えない・声が届かない | ネットワークによっては P2P がつながりません。参加者の一覧で「中継」と出ていれば、親サーバー経由でつながっています。親サーバーが中継を許していないと話せません |
| 重い・カクカクする | 画質を下げる、影を切る、アバターを表示する人数と距離を減らす、鏡を「アバターだけ」にする |
| ワールドが古いまま | 設定の「そのほか」で保存したファイルを消してから入り直してください |
`,dt='# ワールド SDK ガイド\n\nTenTenV のワールドは、React Three Fiber（React で three.js の 3D を書くライブラリ）のコンポーネントです。`@tentenv/sdk` のフックと部品を使うと、押せる物・つかめる物・椅子・鏡・動画・全員で同じになる状態・保存するデータなどを作れます。\n\nこのガイドでは、プロジェクトの作り方、設定ファイル、コマンド、API、同期のしくみ、制限をまとめます。実際の例は `worlds/template/`（ひな型）と `worlds/home/src/`（標準のホームワールド。SDK の機能をひととおり使っています）にあります。\n\n---\n\n## 1. プロジェクトを作る\n\nSDK はこのリポジトリのワークスペースの中で使います（npm には公開していません）。`worlds/` の下のフォルダは自動でワークスペースになります。\n\n```sh\ncp -r worlds/template worlds/my-world\n```\n\n`worlds/my-world/package.json` の `name` を変えます（例 `@tentenv-worlds/my-world`）。そのあとリポジトリのルートで `npm install` を実行します。\n\nできあがるフォルダ:\n\n```\nworlds/my-world/\n├─ package.json      scripts: dev / build / pack / typecheck\n├─ ttv-world.json    ワールドの設定（名前・人数・許可するドメインなど）\n├─ vite.config.ts    export default defineWorldConfig()\n├─ tsconfig.json\n├─ public/           画像・音・モデルなど。そのままパッケージに入る\n└─ src/index.tsx     ワールドの入口\n```\n\n`src/index.tsx` は、ワールドのコンポーネントを `default` か、名前付きの `World` で export します。\n\n```tsx\nimport { CuboidCollider, RigidBody } from \'@react-three/rapier\'\nimport { Clickable, SpawnPad, useSyncedState } from \'@tentenv/sdk\'\n\nexport default function World() {\n  const [on, setOn] = useSyncedState(\'lamp\', false)\n  return (\n    <>\n      <hemisphereLight args={[\'#ffffff\', \'#555555\', 1]} />\n      <SpawnPad position={[0, 0, 4]} yaw={0} />\n      {/* 床（type="fixed" は動かない当たり判定） */}\n      <RigidBody type="fixed" colliders={false}>\n        <CuboidCollider args={[10, 0.1, 10]} position={[0, -0.1, 0]} />\n      </RigidBody>\n      <Clickable label={on ? \'消す\' : \'点ける\'} onClick={() => setOn(!on)} position={[0, 1, 0]}>\n        <mesh>\n          <boxGeometry args={[0.3, 0.3, 0.3]} />\n          <meshStandardMaterial color={on ? \'#ffd040\' : \'#333\'} />\n        </mesh>\n      </Clickable>\n    </>\n  )\n}\n```\n\n- ワールドは、クライアントが用意した `<Physics>`（Rapier の物理演算、1/60 秒ごと）の中で描かれます。床や壁の当たり判定は `@react-three/rapier` の `RigidBody` や `CuboidCollider` で置きます。\n- ワールドに照明が 1 つもないと、アバターが見えるようにクライアントが控えめな照明を足します。\n- `public/` に置いたファイルは `useWorldEnv().assetUrl(\'model.glb\')` で URL を得ます。\n\n### 共有モジュール（同梱しないもの）\n\n次のモジュールはクライアントが `window.__TTV__` で渡すので、`world.js` には入りません（ファイルを小さくし、バージョンをそろえるため）。\n\n| モジュール | 受け取り先 |\n|---|---|\n| `react`、`react/jsx-runtime`、`react/jsx-dev-runtime` | クライアントの React |\n| `react-dom` | 同 |\n| `three` | クライアントの three.js |\n| `@react-three/fiber` | 同 |\n| `@react-three/drei` | 同 |\n| `@react-three/rapier` | 同 |\n| `@tentenv/sdk` | クライアントが持つ SDK |\n\n一覧は `packages/sdk/src/build/vite.ts` の `SHARED_MODULES` です。これ以外のライブラリ（`three/examples/jsm/...` を含む）は `world.js` に同梱されます。ワールドは 1 つの `world.js`（IIFE 形式）にビルドされます。\n\n---\n\n## 2. ttv-world.json\n\nワールドの設定です。`ttv-world pack` がこれをもとに `world.json`（マニフェスト）を作ります。型は `packages/sdk/src/tools/manifest.ts` の `WorldProjectConfig` です。\n\n```json\n{\n  "name": "ホーム",\n  "description": "広場のあるワールド",\n  "tags": ["home", "lobby"],\n  "thumbnail": "thumbnail.png",\n  "recommendedCapacity": 16,\n  "maxCapacity": 32,\n  "physics": { "gravity": 9.81, "jump": 4.4, "allowInfiniteJump": false },\n  "camera": { "near": 0.03, "far": 900 },\n  "render": { "toneMapping": "aces", "exposure": 1, "hdr": false },\n  "spawn": { "position": [0, 0, 13.5], "yaw": 0 },\n  "permissions": { "allowedDomains": [], "relaxedRules": [] },\n  "credits": [{ "name": "three.js", "author": "three.js authors", "license": "MIT", "url": "https://github.com/mrdoob/three.js" }],\n  "ignore": ["*.psd"]\n}\n```\n\n| 項目 | 既定値 | 説明 |\n|---|---|---|\n| `name` | （必須） | ワールド名。80 文字まで |\n| `description` | `""` | 説明。2000 文字まで |\n| `tags` | `[]` | タグ。10 個まで、1 つ 24 文字まで |\n| `thumbnail` | なし | サムネイルのファイル（`public/` に置いた名前）。パッケージにないときは無視されます |\n| `recommendedCapacity` | `12` | 推奨人数（1〜80） |\n| `maxCapacity` | `16` | 最大人数（1〜80）。インスタンスの定員の既定値になります（親サーバーの `maxInstanceCapacity`、既定 40 が上限） |\n| `physics.gravity` | `9.81` | 重力（m/s²） |\n| `physics.jump` | `4.4` | ジャンプの初速（m/s） |\n| `physics.allowInfiniteJump` | `false` | 空中でも何度でもジャンプできる |\n| `camera.near` / `camera.far` | `0.03` / `1000` | カメラの描画範囲（m）。`far` は利用者の「描画距離」の設定でさらに短くなります |\n| `render.toneMapping` | `"aces"` | `aces`・`agx`・`neutral`・`none` |\n| `render.exposure` | `1` | 露出 |\n| `render.hdr` | `false` | 描画の途中を浮動小数点（HalfFloat）で持つ |\n| `spawn.position` / `spawn.yaw` | 原点・0 | 出現位置と向き（度）。`<SpawnPad>` があればそちらが優先 |\n| `permissions.allowedDomains` | `[]` | 動画・画像・通信を許すドメイン（32 個まで）。`example.com` か `*.example.com`（サブドメインも含む）。https のみ |\n| `permissions.relaxedRules` | `[]` | 緩める静的検査のルール名（下の表） |\n| `credits` | なし | 素材のクレジット `{name, author, license, url?}`。200 件まで |\n| `ignore` | なし | パッケージに入れないファイル（末尾一致、`*` と `**` が使える） |\n\n`.DS_Store`・`Thumbs.db`・`*.map`・`.gitkeep`・`index.html`・`world.json` は常に除かれます。パッケージに入れられるファイルは 2000 個まで、パス名に `..` や絶対パスは使えません。\n\n### permissions.relaxedRules に書けるルール\n\nアップロードの前（CLI）と、親サーバーの受け付けのときに、同じ静的検査（`.js`・`.mjs`・`.cjs` のファイルの文字列を調べること）をします。見つかったら拒否されます。どうしても必要なものだけ、ルール名を `relaxedRules` に書くと通ります。緩めたルールはワールドの詳細画面に「緩和された検査」として表示されます。\n\n| ルール名 | 検出するもの |\n|---|---|\n| `no-eval` | `eval()` |\n| `no-new-function` | `new Function(...)`・文字列を渡す `Function(...)` |\n| `no-string-timeout` | 文字列を渡す `setTimeout` / `setInterval` |\n| `no-javascript-blob` | JavaScript の Blob の作成 |\n| `no-external-import` | 外部 URL からの `import()` |\n| `no-network-without-permission` | SDK を通さない通信（`fetch(`・`XMLHttpRequest`・`new WebSocket(`・`EventSource`・`sendBeacon`） |\n| `no-rtc-connection` | `RTCPeerConnection`・`RTCDataChannel` |\n| `no-storage-access` | `localStorage`・`sessionStorage` |\n| `no-cookie-access` | `document.cookie` |\n| `no-indexeddb-access` | `indexedDB` |\n| `no-dangerous-dom` | `innerHTML`・`outerHTML` への代入、`insertAdjacentHTML`、`document.write`、`<script>` 要素の作成 |\n| `no-navigator-access` | 位置情報・カメラ・マイク・クリップボード・`credentials`・`serviceWorker`・`getUserMedia` |\n| `no-sensitive-api-override` | `window.fetch = ...` などの上書き |\n| `no-global-override` | `window.document`・`location`・`top`・`parent`・`__TTV__` の上書き、`location.href =` |\n| `no-prototype-pollution` | 組み込みのプロトタイプの書き換え、`__proto__ =` |\n| `no-obfuscation` | `\\xNN` のエスケープが 400 個を超える（難読化の目安） |\n\n通信が必要なら、ルールを緩めるより `useExternal().fetch` を使ってください（6.7）。\n\n---\n\n## 3. コマンド（ttv-world）\n\nワールドのフォルダで `npx ttv-world <コマンド>` として使います（`package.json` の `npm run dev` / `build` / `pack` からも呼べます）。\n\n| コマンド | 内容 |\n|---|---|\n| `ttv-world build` | `vite build` で `dist/` を作り、ファイルの一覧と静的検査の結果を出す。問題があれば終了コード 1 |\n| `ttv-world check` | `dist/world.js` の静的検査だけをする |\n| `ttv-world pack [-o out.ttvw] [--no-build]` | ビルドして `.ttvw`（zip）を作る。`-o` がなければ `<name>.ttvw`（英数字以外は `_` になるので、日本語の名前なら `-o` で指定するのがおすすめ） |\n| `ttv-world upload --server <URL> [--token <t>] [--world <ID>] [--no-build]` | ビルドして親サーバーへ登録する。`--world` を付けるとそのワールドの新しい版として更新する |\n| `ttv-world dev [--port 5180] [--client http://localhost:5190]` | 変更を見張ってビルドし続け、`http://localhost:<port>/` でワールドを配信する。クライアントで開く URL を表示する |\n\n`upload` のトークンは、クライアントの「設定 → アカウント・サーバー → 制作者向け」でコピーできるセッショントークンです。環境変数 `TTV_TOKEN` でも渡せます。人に教えないでください。\n\n```sh\ncd worlds/my-world\nnpx ttv-world upload --server http://localhost:8787 --token <トークン>\n# 2 回目からは表示された ID を付けて更新\nnpx ttv-world upload --server http://localhost:8787 --token <トークン> --world <ワールドID>\n```\n\nクライアントのホームの「制作」タブからも `.ttvw` を登録・更新できます。\n\n### 開発中のワールドを試す（複数タブで多人数テスト）\n\n1. リポジトリのルートで `npm run dev:client`（クライアント、http://localhost:5190）\n2. ワールドのフォルダで `npx ttv-world dev`\n3. 表示された `http://localhost:5190/?devWorld=http%3A%2F%2Flocalhost%3A5180%2F` を開く（接続画面の「ワールド制作者向け: 開発中のワールドを開く」からも開けます）\n4. 同じブラウザで複数のタブを開くと、タブどうしが BroadcastChannel でつながり、同期を確かめられます\n\n開発用の実行環境は親サーバーを使いません。そのため次の違いがあります。\n\n- 声は送りません。\n- `useWorldStore` はブラウザの localStorage に保存します。\n- `useInstanceFiles` の一覧は空で、アップロードはできません。\n- `useNavigation` の `getWorldInfo` / `getInstanceInfo` はエラー、`listWorlds` は空の一覧を返します。\n- ワールド ID は `dev:<ワールド名>`、インスタンス ID は `dev` です。\n- `world.json` はリクエストのたびに作り直され、SHA-256 の照合は本番と同じように行われます。\n\nメニューの「デバッグ」には、ホスト・同期状態・最近のイベント・接続・時計の誤差が出ます。設定の「性能の表示」をオンにすると、FPS・描画回数（draw call）・ポリゴン数が画面の隅に出ます。\n\n---\n\n## 4. 同期のしくみ\n\nインスタンスの参加者は WebRTC で全員とつながり、次のものを共有します。\n\n| しくみ | 使う API | あとから来た人に届くか |\n|---|---|---|\n| 同期状態（全員が同じ値を持つ） | `useSyncedState`・`useSyncedObjects`・`useOwnership` | 届く（ホストが一覧を渡す） |\n| イベント（その場の合図） | `useEmit`・`useNetEvent` | 届かない |\n| 共有時計 | `useNetClock`・`useSyncedTicker` | — |\n| つかめる物の位置 | `<Pickup>` | 届く |\n| 保存するデータ（親サーバー） | `useWorldStore` | インスタンスが閉じても残る |\n\n### ホスト\n\n参加者のうち 1 人が「ホスト」になり、同期状態の変更の順番を決めて全員に配ります。全員が同期状態の複製を持つので、ホストが抜けると次の人が引き継ぎます。順番は全員が同じ規則で計算します（ホストを引き受けられる人 → 先に入った人 → 接続 ID の順）。ホストだけが動かすギミックには `useIsHost()` を使います。\n\n### 同期状態の流れ\n\n1. `set` すると、自分の画面ではすぐに値が変わります（ホスト以外は「確定待ち」）。\n2. ホストが受け付けると、全員に確定した値が届きます。\n3. ホストが断ると（レート制限・大きすぎるなど）、自分の画面の値は元に戻ります。\n\n同期状態はインスタンスのメモリにあるだけで、全員が抜けると消えます。残したいものは `useWorldStore` に保存してください。\n\n### 上限（packages/protocol/src/limits.ts）\n\n| 項目 | 上限 |\n|---|---|\n| 同期状態のキー | `w:` の後ろが `[A-Za-z0-9_.\\-:/]` で 120 文字まで（`useSyncedState(\'lamp\')` は `w:lamp` になる） |\n| 値の大きさ | JSON にして 16KB |\n| キーの数 | インスタンス全体で 1024 個（プラットフォームの分も含む） |\n| 更新の回数 | 1 人 1 秒 30 回 |\n| イベント名 | `[A-Za-z0-9_.\\-:]` で 64 文字まで（中で `w.` が付くので、ワールドが使えるのは 62 文字まで） |\n| イベントの中身 | JSON にして 8KB |\n| イベントの回数 | 1 人 1 秒 40 回 |\n| チャット | 300 文字、10 秒に 8 回 |\n\nキーの形が違う・値が大きすぎるときは、`set` や `emit` が例外を投げます。\n\n---\n\n## 5. 部品（コンポーネント）\n\n### `<Clickable>`\n\n中の物を押せるようにします。PC は画面の中心の照準でクリック、スマホはタップ、VR はレイを当ててトリガーか、人差し指で触れます。\n\n| props | 型・既定値 | 説明 |\n|---|---|---|\n| `label` | string | 照準を合わせたときの説明 |\n| `enabled` | `true` | `false` で押せなくする |\n| `reach` | PC 3.2m（三人称 6m）・VR 12m | 届く距離（m） |\n| `onClick` | `(e: { peerId, hand: \'left\'\\|\'right\'\\|\'none\', point: [x,y,z] }) => void` | 押されたとき（押した人の端末だけで呼ばれる） |\n| `onHover` | `(hovered: boolean) => void` | VR のレイが当たった・外れた |\n\nほかの props は `<group>` にそのまま渡ります。当たりは中のメッシュで判定するので、見えない当たり用のメッシュでもかまいません（`visible={false}` の親の下にあると押せません）。\n\n```tsx\n<Clickable label="ベルを鳴らす" onClick={() => emit(\'bell\')} position={[0, 1, 0]}>\n  <mesh><sphereGeometry args={[0.1]} /><meshStandardMaterial /></mesh>\n</Clickable>\n```\n\n### `<Pickup>`\n\nつかめる物です。つかんだ人の手（PC は目の前）に付いて動き、位置は全員に同期されます。\n\n| props | 既定値 | 説明 |\n|---|---|---|\n| `id` | （必須） | ワールドの中で一意な ID |\n| `label` | — | 照準を合わせたときの説明（なければ「つかむ」） |\n| `physics` | `true` | 離すと落ちる・投げられる。物の大きさの箱の当たり判定が自動で付きます |\n| `orientation` | `\'keep\'` | `\'keep\'` はつかんだときの向きを保つ、`\'grip\'` は手の向きに合わせる |\n| `throwable` | `true` | 離したときに手の勢いで飛ぶ |\n| `onGrab` / `onDrop` / `onUse` | `(by: PlayerInfo) => void` | つかんだ・離した・持ったまま「使う」を押した（その人の端末で呼ばれる） |\n\n`ref` で `PickupHandle` を受け取れます: `holder()`（持っている人の peerId）、`drop()`、`reset(position, quaternion?)`（全員で元の場所へ戻す）。\n\n- 持ち主（最後につかんだ人。いなければホスト）だけが物理演算で動かし、15 回/秒で位置を配ります。\n- ほかの人が持っている物は取り上げられません。\n- 自分で `RigidBody` の中に入れないでください（体は SDK が作ります）。\n- 一度に送れる物の位置は 32 個までです。同時に動く物はそれ以下にしてください。\n\n```tsx\nconst ref = useRef<PickupHandle>(null)\n<Pickup ref={ref} id="cup" label="カップ" position={[1, 1, 0]} onUse={() => notify(\'乾杯！\')}>\n  <mesh><cylinderGeometry args={[0.04, 0.04, 0.1]} /><meshStandardMaterial /></mesh>\n</Pickup>\n<Clickable label="カップを戻す" onClick={() => ref.current?.reset([1, 1, 0])}>…</Clickable>\n```\n\n### `<Chair>`\n\n座れる場所です。`group` の原点がお尻の位置、-Z が前です。押すと座り、ジャンプか移動で立ちます。座席の状態（誰が座っているか）は全員に同期されます。\n\n| props | 既定値 | 説明 |\n|---|---|---|\n| `id` | （必須） | 一意な ID |\n| `label` | `\'座る\'` | 説明 |\n| `exit` | `{ forward: 0.6, right: 0, up: 0 }` | 立ち上がったときの位置（座席から見て、m） |\n| `onInput` | — | 座っている間の移動入力 `{forward, right, up}` を受け取る（乗り物など）。これを指定すると、移動やジャンプでは立ち上がらなくなるので、立たせる処理は自分で書きます |\n| `onEnter` / `onLeave` | — | 自分が座った・立った |\n| `hitSize` | `[0.5, 0.5, 0.5]` | 押して座るための見えない当たり。`null` で付けない |\n\n`ref` で `SeatHandle`（`occupant()`・`sit()`・`stand()`）を受け取れます。\n\n### `<SpawnPad>`\n\n入ってきた人が現れる場所です。`position`（既定 `[0,0,0]`）、`yaw`（度）。複数あるときは最後に置いたものが使われます。落ちて y が -80 より下になったときと、リスポーンしたときもここに戻ります。\n\n### `<TriggerZone>`\n\n見えない箱です。プレイヤーの足元から 0.5m 上の点が入っているかで判定します。\n\n| props | 説明 |\n|---|---|\n| `position` / `size` | 箱の中心と大きさ（置いた場所のローカル座標） |\n| `onEnter` / `onLeave` | 自分が入った・出た |\n| `onCount` | 中にいる人数が変わった（全員の分を各端末で数える） |\n| `debug` | 緑の枠を表示する |\n\n### `<FaceCamera>`\n\n中の物をいつもカメラのほうへ向けます。`mode="y"`（既定。横回転だけ）か `"full"`。\n\n### `<MirrorSurface>`\n\n鏡です。アバターは三人称の見た目（自分の頭も）で映ります。\n\n| props | 既定値 | 説明 |\n|---|---|---|\n| `width` / `height` | `2` / `2` | 大きさ（m） |\n| `position` / `rotation` | — | 置き場所 |\n| `quality` | `1` | 画面の解像度に対する倍率（最大 2048px） |\n| `tint` | `\'#c8ccd0\'` | 色 |\n| `showWorld` | `true` | `false` でアバターだけを映す（軽くなる） |\n\n鏡はシーンをもう一度描くので重い部品です。`quality` を下げるか、切り替えられるようにしておくのがおすすめです（ホームの `MirrorCorner.tsx` を参照）。\n\n### `<MediaScreen>`\n\n動画プレイヤーです。再生・停止・シーク・URL は全員で同期し（同期状態 `w:media:<id>`）、共有時計で再生位置をそろえるので、あとから来た人も同じ所から見られます。\n\n| props | 既定値 | 説明 |\n|---|---|---|\n| `id` | （必須） | 一意な ID |\n| `width` | `3.2` | 幅（m）。高さは 16:9 |\n| `position` / `rotation` | — | 置き場所 |\n| `defaultUrl` | `\'\'` | 最初に流す URL |\n| `controls` | `true` | 操作パネル（再生・±10 秒・最初から・URL・ループ・音量・ロック） |\n| `range` | `18` | 聞こえる距離（m） |\n| `volume` | `0.8` | 音量（音量は各自の手元だけで変わる） |\n\n- URL は `https://` の直接のファイル（mp4・webm）か HLS（`.m3u8`）で、CORS（ほかのサイトから読み込むことの許可）に対応している必要があります。YouTube などの埋め込み専用の動画は再生できません。\n- ドメインは `permissions.allowedDomains` に書くか、ワールドと同じ親サーバーのファイル（インスタンス共有ファイルなど）を使います。\n- 「ロック」すると、ロックした人とインスタンスの作成者・モデレーターだけが操作できます。ロックした人がいなくなると誰でも操作できます。\n- ずれが 0.6 秒を超えると飛び、小さいずれは再生速度を ±4% 変えて合わせます。\n\n同期の状態の形は `MediaState` 型（`url, playing, offset, anchor, loop, lockedBy`）として export しています。\n\n### `<ImagePanel>`\n\n画像の板です。`url`、`width`（既定 1）、`position`、`rotation`。許可されたドメイン・同じオリジン・`blob:` の URL だけを読み込みます。\n\n### `<PortalGate>`\n\n別のワールドやインスタンスへの入口です。`worldId` か `instanceId`、`position`、`rotation`、`confirm`（既定 `true`、移動の前に確認する）。押すか、くぐる（1.4×2×0.4m の範囲に入る）と移動します。`worldId` のときは、空きのあるパブリックなインスタンスへ入り、なければ新しく作ります。\n\n### `<TextPlane>`\n\n文字の板です。フォントファイルを読み込まずに日本語を表示できます（Canvas に描きます）。\n\n| props | 既定値 |\n|---|---|\n| `text` | （必須） |\n| `width` | `1`（m。高さは文字の量で決まる） |\n| `lineHeight` | `0.08` |\n| `color` / `background` | `\'#ffffff\'` / `null` |\n| `align` | `\'center\'` |\n| `bold` / `padding` / `maxLines` / `radius` | `false` / `0.03` / `40` / `0.03` |\n| `position` / `rotation` / `doubleSide` / `renderOrder` / `depthTest` | — / — / `false` / — / `true` |\n\n文字が変わるたびにテクスチャを作り直すので、毎フレーム変わる文字には向きません。`wrapText` と `useTextTexture` も export しています。\n\n### `<SpatialSound>`\n\n置いた場所から聞こえる音です（three.js の `PositionalAudio`）。\n\n| props | 既定値 | 説明 |\n|---|---|---|\n| `src` | （必須） | `public/` のファイル名か、`http(s)://` の URL |\n| `position` | — | 置き場所 |\n| `volume` | `0.6` | 音量 |\n| `loop` | `true` | くり返す |\n| `refDistance` / `maxDistance` | `2` / `30` | この距離までは同じ大きさ、そこから小さくなる（m） |\n| `synced` | `true` | ループする音の再生位置を共有時計に合わせ、全員で同じ所から鳴らす |\n| `playing` | `true` | 鳴らすか |\n\n```tsx\n<SpatialSound src="fountain.ogg" position={[0, 0.5, 0]} volume={0.4} maxDistance={20} />\n```\n\n### `LAYERS`\n\nthree.js のレイヤーの使い分けです。`DEFAULT: 0`、`FIRST_PERSON_ONLY: 9`（一人称の視点にだけ映る）、`THIRD_PERSON_ONLY: 10`（鏡・カメラにだけ映る）、`NO_MIRROR: 11`（鏡に映さない）、`AVATAR: 12`。1 と 2 は WebXR が左右の目に使うので避けてください。\n\n### `useSyncedToggle(key, initial)`\n\n`[on, toggle]` を返す、全員で同期するスイッチです（中身は `useSyncedState(key, initial)`）。ドアや照明に使います。\n\n---\n\n## 6. フック\n\nすべてワールドのコンポーネントの中で使います（ワールドの外で使うとエラーになります）。\n\n### 6.1 環境\n\n**`useWorldEnv()`** → `{ baseUrl, assetUrl(path), worldId, worldName, instanceId, persistent, dev }`\n\n```ts\nconst env = useWorldEnv()\nconst url = env.assetUrl(\'models/table.glb\') // 先頭の / は付けない\n```\n\n**`useDevice()`** → `\'desktop\' | \'mobile\' | \'vr\'`。VR に入る・出るときに変わります。\n\n### 6.2 同期状態\n\n**`useSyncedState<T>(key, initial): [T, set]`**\n\n全員で同じ値を持つ状態です。`useState` と同じように使え、`set` には値か関数（前の値を受け取る）を渡せます。値は JSON にできるもの（16KB まで）。\n\n```tsx\nconst [score, setScore] = useSyncedState(\'score\', 0)\n<Clickable onClick={() => setScore((s) => s + 1)}>…</Clickable>\n```\n\n**`useSyncedObjects<T>(key, max = 64)`** → `{ items, spawn(data), update(id, data), remove(id), clear() }`\n\n全員で同じ一覧を持つ物（置いたブロック・投げ込んだボールなど）です。`items` は `{ id, by, data }[]`（`by` は作った人の peerId）。`spawn` は新しい ID を返し、`max` を超えると古いものから消えます。一覧全体が 1 つの同期状態 `w:objs:<key>` に入るので、16KB に収まる数（数十個程度）にしてください。\n\n```tsx\nconst balls = useSyncedObjects<{ x: number; z: number; color: string }>(\'balls\', 30)\n<Clickable label="ボールを出す" onClick={() => balls.spawn({ x: Math.random(), z: 0, color: \'#ff7eb6\' })}>…</Clickable>\n{balls.items.map((b) => (\n  <mesh key={b.id} position={[b.data.x, 0.2, b.data.z]}>…</mesh>\n))}\n```\n\n（`worlds/template/src/index.tsx` の `BallMaker` が例です。）\n\n**`useOwnership(id)`** → `{ owner, isMine, take(), release() }`\n\n共有オブジェクトの「持ち主」です。持ち主だけが動かし、ほかの人はその結果を受け取る、という形に使います。持ち主がいなくなるとホストに戻ります。中では同期状態 `w:own:<id>` を使います。\n\n**`useIsHost()`** → `boolean`。自分がホストか。\n\n**`useOnChange(value, cb)`** — 値が変わったときだけ `cb(value, prev)` を呼びます（最初の描画では呼びません）。同期状態の変化に合わせた演出に便利です。\n\n### 6.3 イベント\n\n**`useEmit()`** → `emit(name, payload?, target = \'all\')`\n\n| target | 届く先 |\n|---|---|\n| `\'all\'` | 自分を含む全員 |\n| `\'others\'` | 自分以外 |\n| `\'host\'` | ホストだけ |\n| peerId | その人だけ |\n\n**`useNetEvent(name, handler)`** — `handler(payload, from: PlayerInfo)`。handler は毎回最新のものが呼ばれます。\n\n```tsx\nconst emit = useEmit()\nuseNetEvent<{ n: number }>(\'firework\', (p, from) => launch(p.n, from.displayName))\n<Clickable onClick={() => emit(\'firework\', { n: 3 })}>…</Clickable>\n```\n\nイベントはその場にいる人にだけ届き、保存されません。\n\n### 6.4 時計\n\n**`useNetClock(opts?)`** → `{ now(), synced, uncertainty, trustworthy, jumps }`\n\nインスタンスで共通の時刻（UNIX ミリ秒）です。親サーバーとの往復時間から時計のずれを推定し、親サーバーが使えないときはホストの時計に合わせます。`now()` は `useFrame` の中で毎フレーム呼んでかまいません。\n\n- `uncertainty`: 推定誤差の上限（ms）\n- `opts.require`: `\'media\'`（±300ms）か `\'motion\'`（±100ms）を満たすまで `trustworthy` が `false`\n- `jumps`: 時刻が大きく飛んだ回数（同期し直したとき）。アニメーションを合わせ直すのに使えます\n\n```tsx\nconst clock = useNetClock({ require: \'motion\' })\nuseFrame(() => { ref.current!.rotation.y = (clock.now() / 1000) % (Math.PI * 2) })\n```\n\n**`useSyncedTicker(periodMs)`** → 全員で同じ値になる、一定時間ごとに 1 ずつ増える数。\n\n### 6.5 プレイヤー\n\n**`usePlayers()`** → `{ local, others, all, host, getPose(peerId) }`\n\n`PlayerInfo` は `userId`・`peerId`（その入室のあいだだけの接続 ID）・`displayName`・`iconUrl`・`isLocal`・`isHost`・`isGuest`・`role`（`\'owner\' | \'moderator\' | \'member\'`）・`device`。ほかの人の `device` は今の版では `\'vr\'` か `\'desktop\'` だけです（スマホかどうかは伝わりません）。\n\n`getPose(peerId)` は `PlayerPose`（`position`（足元）・`yaw`・`head`・`leftHand`・`rightHand`・`height`・`eyeHeight`・`grounded`・`sitting`・`velocity`）を返します。`useFrame` の中で呼んでください。\n\n**`useTeleport()`** → `{ teleport(position, yaw?), respawn() }`。`yaw` はラジアンです（`<SpawnPad>` とマニフェストは度なので注意）。\n\n**`useVoiceGain()`** → `(peerId, gain | null) => void`。その人の声の音量（0〜2）を、このワールドの中だけで変えます（ステージのマイクなど）。`null` で元に戻します。\n\n**`useAudioListener()`** — カメラに付いている `AudioListener`。ワールドの立体音響はこれにつなぎます。\n\n### 6.6 データ\n\n**`useWorldStore()`** → `{ shared, player }`\n\n親サーバーに保存するデータです。インスタンスが閉じても残ります。\n\n- `shared`: ワールド全体で 1 つ\n- `player`: 利用者ごと。書けるのは自分の分だけ。`player.read(userId, key)` で他人の分も読めます\n\nどちらも `get(key)`・`list()`・`set(key, value)`・`increment(key, delta)`・`remove(key)`（すべて Promise）。\n\n```tsx\nconst store = useWorldStore()\nconst visits = await store.shared.increment(\'visits\', 1)\nawait store.player.set(\'best\', 42)\n```\n\n| 項目 | 上限 |\n|---|---|\n| キー | `^[A-Za-z0-9_.\\-:]{1,128}$` |\n| 値 | JSON で 100KB（キーの長さを含む） |\n| キーの数 | `shared` 256 個、1 人あたり 64 個 |\n| ワールドの合計 | 10MB |\n| 書き込みの回数 | 1 人 1 分 30 回 |\n\n- 書けるのは、ゲスト以外で、そのワールドのインスタンスに入っている人と、ワールドの制作者だけです。読むのはログインしている人なら誰でもできます。\n- 値がないキーの `get` は `null` です（開発用の実行環境では `undefined`）。\n- `increment` は数値でない値には使えません。\n- 開発用の実行環境ではブラウザの localStorage に保存されます。\n\n**`useInstanceFiles()`** → `{ list(), upload(file, opts?), update(id, changes), remove(id) }`\n\nインスタンスで共有するファイル（アップロードした曲・画像など）です。`SharedFileInfo`（`id, fileName, contentType, fileSize, url, description, meta, locked, uploadedBy, createdAt`）を返します。\n\n- アップロードできるのは、そのインスタンスにいる人（と作成者）です。ゲストは親サーバーの `allowGuestUploads` しだいです。\n- 1 ファイルの上限は親サーバーの設定（既定 50MB）、1 インスタンス 200 個・合計 1GB まで。\n- `opts`: `description`（500 文字まで）、`meta`（文字列 → 文字列、20 項目まで）、`onProgress(ratio)`。\n- 変更・削除はアップロードした人とインスタンスの作成者（と管理者）だけ。`locked: true` にしたファイルは、ロックを外すまで変更・削除できません。\n- インスタンスが閉じるとファイルも消えます。\n- ファイルの URL（`/files/instances/...`）は認証なしで読めます。URL を知っている人は誰でも取得できるので、秘密のものは置かないでください。\n\n**`useFilePicker()`** → `pickFile({ accept?, multiple?, maxBytes?, onPick, onCancel?, onError? })`\n\n利用者にファイルを選んでもらいます（選んだファイルだけがワールドに渡ります）。`accept` は `"audio/*,.mp3"` のような形。種類や大きさが合わないと `onError({ kind: \'too_large\' | \'wrong_type\', message })`。VR の中ではファイルを選べないので、ヘッドセットを外して画面で選ぶよう案内が出ます。\n\n```tsx\nconst pick = useFilePicker()\nconst files = useInstanceFiles()\n<Clickable label="曲を追加" onClick={() => pick({ accept: \'audio/*\', maxBytes: 50 * 1024 * 1024, onPick: ([f]) => void files.upload(f) })}>…</Clickable>\n```\n\n### 6.7 外部への通信\n\n**`useExternal()`** → `{ isAllowed(url), fetch(url, init?) }`\n\n`fetch` は許可された URL にだけ送れます（Cookie などの資格情報は付けません）。許可されるのは次のどれかです。\n\n- `permissions.allowedDomains` のドメインの `https://` の URL\n- クライアントと同じオリジン、親サーバーのオリジン、ワールドのファイルの URL\n- 利用者が設定で「許可されていないドメインの動画・画像も読み込む」をオンにしているときの `https://` の URL\n\n`<SpatialSound>` は今の版では許可の確認をせずに URL を読み込みます。外部の音を使うときも `allowedDomains` に書いておいてください。\n\n### 6.8 ダイアログ\n\n**`useDialogs()`** → `{ confirm(req), prompt(req), notify(text) }`\n\n- `confirm({ title?, message, okLabel?, cancelLabel? })` → `Promise<boolean>`\n- `prompt({ title?, message?, initial?, maxLength?, multiline? })` → `Promise<string | null>`（VR では仮想キーボード。ローマ字かな入力ができます）\n- `notify(text)` — 数秒で消える通知\n\nPC・スマホでは画面の上に、VR では目の前の板に出ます。\n\n### 6.9 移動\n\n**`useNavigation()`** → `{ openWorld(worldId), openInstance(instanceId), getWorldInfo(id), getInstanceInfo(id), listWorlds({ query?, tag?, sort?, limit? }) }`\n\n`listWorlds` の `sort` は `\'popular\' | \'new\' | \'recommended\'`（既定 `popular`）、`limit` は 1〜50（既定 12）。ポータルの一覧などに使います（ホームの `PortalHall.tsx` を参照）。\n\n### 6.10 そのほか\n\n- `useRuntime()` — 実行環境（`WorldRuntime`）そのもの。ふつうは上のフックを使ってください。\n- `SDK_VERSION` — SDK のバージョン文字列（`\'0.1.0\'`）。\n\n### ビルド・ツール用のエントリ\n\n| import | 中身 |\n|---|---|\n| `@tentenv/sdk/vite` | `defineWorldConfig({ entry?, vite? })`・`SHARED_MODULES` |\n| `@tentenv/sdk/tools` | `packWorld`・`unpackWorld`・`scanCode`・`SCAN_RULES`・`RELAXABLE_RULES`・`buildManifest`・`checkManifest`・`domainAllowed` |\n| `@tentenv/sdk/manifest` | マニフェストの関数だけ（ブラウザでも使える） |\n\n`defineWorldConfig` の `entry` は入口のファイル（既定 `src/index.tsx`）、`vite` は追加の Vite 設定です。\n\n---\n\n## 7. 性能のコツ\n\nPC だけでなく、スマホや Quest のような単体の VR ヘッドセットでも動くように作るのがおすすめです。スマホは既定で画質「低」・影なしになります。\n\n- **描画回数（draw call）を減らす**: メッシュとマテリアルの組み合わせごとに 1 回の描画になります。同じ物をたくさん置くときは `InstancedMesh`（drei の `<Instances>` でも可）を使い、動かない物はジオメトリをまとめます。設定の「性能の表示」で回数を確かめられます。\n- **ポリゴンとテクスチャ**: テクスチャは必要な大きさに。1024px 程度までを目安にし、大きな画像をたくさん使わない。\n- **影と光**: 影を落とす光は 1 つまでにし、影の範囲（shadow camera）を狭く。動かない光は、明るさをテクスチャに焼き込むと軽くなります。\n- **鏡**: シーンをもう一度描くので重い。`quality` を下げる、`showWorld={false}` にする、押したときだけ出すなど。\n- **動画・音**: 同時に再生するのは最小限に。\n- **毎フレームの処理**: `useFrame` の中で `new` を繰り返さない。React の state を毎フレーム変えない（`ref` を直接動かす）。\n- **文字**: `TextPlane` は文字が変わるたびに作り直すので、頻繁に変わる表示は数を絞る。\n- **同期**: 位置のように速く変わる値を同期状態に入れない（1 秒 30 回の制限があります）。動く物は `<Pickup>` か、ホストや持ち主が決めた値を共有時計で再生する形にします。\n\n---\n\n## 8. 安全のための制限\n\n- ワールドのコードは、クライアントと同じページの中で動きます（iframe などでの隔離はまだしていません）。そのため、アップロード時と受け付け時の静的検査（2 章）と、SDK の API の制限で守っています。\n- `world.js` とファイルは、マニフェストの SHA-256 と照合してから使います。合わないものは読み込みません。\n- 外部への通信は `useExternal()` を通し、許可したドメインだけに送れます。\n- 同期状態の `sys:` で始まるキー（座席・つかんだ物など）はプラットフォームが使い、ホストが書き込める人を確かめます。ワールドの値は `w:` に入ります。\n- 静的検査は文字列のパターンでの検査なので、完全ではありません。利用者は、知らないワールドに入るときは注意してください。\n\n---\n\n## 9. アバターの拡張定義\n\nVRM に含まれない、衣装の切り替え・手の形と表情の対応・アクションメニューを JSON で定義できます（型は `packages/protocol/src/models.ts` の `AvatarExtensions`）。\n\n**書く場所**: クライアントのホームの「アバター」→ 自分のアバターを選ぶ →「自分のアバターの設定」の「拡張定義（衣装・ジェスチャー・アクションメニュー、JSON）」。保存すると親サーバーに記録されます（32KB まで）。\n\n```json\n{\n  "version": 1,\n  "outfits": [\n    { "id": "hat", "label": "帽子", "nodes": ["Hat", "HatRibbon"], "default": true },\n    { "id": "coat", "label": "コート", "nodes": ["Coat"], "default": false }\n  ],\n  "gestures": {\n    "fist": { "angry": 1 },\n    "victory": { "happy": 1 },\n    "thumbsup": { "happy": 0.6, "relaxed": 0.4 }\n  },\n  "gestureCombos": {\n    "victory+victory": { "surprised": 1 }\n  },\n  "actions": [\n    { "id": "glasses", "label": "メガネ", "kind": "toggle", "target": "Glasses" },\n    { "id": "smile", "label": "にっこり", "kind": "expression", "target": "happy" },\n    { "id": "wow", "label": "びっくり", "kind": "emote", "target": "surprised" }\n  ]\n}\n```\n\n| 項目 | 説明 |\n|---|---|\n| `version` | `1`（必須） |\n| `outfits` | 衣装・アクセサリー。`nodes` は表示を切り替える VRM のノード（オブジェクト）名。`default: true` は最初から表示 |\n| `gestures` | 手の形 → 表情（VRM の Expression 名と重み 0〜1）。手の形は `neutral`・`fist`・`open`・`point`・`victory`・`rocknroll`・`gun`・`thumbsup` |\n| `gestureCombos` | `"左手+右手"` の組み合わせ → 表情 |\n| `actions` | アクションメニューの項目。`kind` が `toggle` なら `target` のノードの表示を切り替え、`expression` なら `target` の表情を付けたり外したり、`emote` なら `target` の表情を 3 秒だけ付ける |\n\n表情の決まり方（優先順位）: メニューで選んだ表情 → 両手の組み合わせ → 左右の手の表情（同じ表情は大きいほう。感情の表情 happy・angry・sad・relaxed・surprised は 1 つだけにし、右手を優先）。`gestures` に書かない手の形は既定の対応（`fist` → angry、`open` → surprised、`point` → relaxed、`victory` → happy、`rocknroll` → happy＋aa、`gun` → 左目を閉じる、`thumbsup` → happy）を使います。\n\n衣装とトグルの状態は、ほかの人にも伝わります（1 体あたり 32 個まで）。\n',ft="# TenTenV 通信仕様\n\nTenTenV の親サーバー・クライアント・参加者どうしの通信の仕様です。親サーバーとのプロトコルはバージョン 2 です。型と上限の定義は `packages/protocol/src/` にあります（`api.ts`・`signal.ts`・`peer.ts`・`models.ts`・`limits.ts`）。この文書はそれをまとめたもので、食い違うときはコードが正です。\n\n全体の流れ:\n\n1. クライアントは親サーバーの REST API（HTTP）でログインし、ワールドやインスタンスを探します。\n2. 親サーバーと WebSocket（`/ws`）をつなぎ、インスタンスに参加します。親サーバーは署名した参加チケットと、中にいる人の一覧を返します。\n3. 参加者どうしは WebSocket で WebRTC の接続情報を受け渡し（シグナリング）、P2P のフルメッシュ（全員と直接つながる形）を作ります。\n4. P2P がつながらない相手とは、親サーバーの WebSocket でデータを中継します。\n\n---\n\n## 1. REST API\n\n- すべて `/api` で始まり、本文は JSON です（アップロードは生のバイト列）。\n- 認証は `Authorization: Bearer <セッショントークン>`。トークンはログインで受け取り、30 日有効（使うと延長）です。親サーバーは SHA-256 にしたものだけを保存します。\n- エラーは HTTP 4xx/5xx と `{ \"error\": \"コード\", \"message\": \"説明\" }`。\n- CORS は設定 `corsOrigins` に従います。\n\n| メソッド・パス | 入力 | 出力・内容 |\n|---|---|---|\n| `GET /api/info` | — | `ServerInfo`（名前・公開鍵・serverId・ログイン方法・上限・中継の可否・ICE サーバー・既定のホームワールド） |\n| `POST /api/auth/guest` | `{displayName}` | `{token, me}`。設定でゲストが無効なら 403 |\n| `POST /api/auth/misskey/start` | `{host, callback}` | `{url, session}`。`url` は Misskey の MiAuth の画面（権限は `read:account` だけ） |\n| `POST /api/auth/misskey/finish` | `{session}` | `{token, me}` |\n| `POST /api/auth/logout` | — | セッションを消す |\n| `GET /api/me` / `PATCH /api/me` | `displayName, bio, links, statusText, status, decoration, settings, homeWorldId, currentAvatarId, iconUrl` の一部 | `MeInfo` |\n| `POST /api/me/icon` | 画像のバイト列 | `MeInfo` |\n| `GET /api/users?q=` | — | `UserSummary[]` |\n| `GET /api/users/:id`・`/api/users/:id/worlds` | — | `UserProfile`・`WorldSummary[]` |\n| `GET /api/friends`・`/api/friends/requests` | — | `FriendEntry[]`・`{incoming, outgoing}` |\n| `POST /api/friends/:userId` | — | 申請（相手から申請が来ていれば承認） |\n| `DELETE /api/friends/:userId` | — | 解除・取り下げ・拒否 |\n| `GET /api/recent` | — | 最近一緒にいた人 `{user, at, worldName}[]` |\n| `GET /api/blocks`・`POST/DELETE /api/blocks/:userId` | — | ブロック |\n| `GET /api/favorites?kind=user\\|world\\|avatar`・`POST/DELETE /api/favorites/:kind/:id` | — | お気に入り |\n| `GET /api/notifications`・`POST /api/notifications/read {ids?}`・`DELETE /api/notifications/:id` | — | 通知 |\n| `POST /api/invites` | `{userId, instanceId, message?}` | 招待 |\n| `POST /api/invite-requests` | `{userId, message?}` | 参加申請（相手のいるインスタンスへの招待を頼む） |\n| `GET /api/avatars?q=&mine=1&favorites=1`・`GET /api/avatars/:id` | — | `AvatarInfo[]`・`AvatarInfo` |\n| `POST /api/avatars?name=&isPublic=&allowCloning=` | VRM のバイト列 | `AvatarInfo` |\n| `PATCH /api/avatars/:id` | `{name, description, isPublic, allowCloning, tags, extensions}` | 変更 |\n| `POST /api/avatars/:id/thumbnail`・`DELETE /api/avatars/:id` | 画像 / — | サムネイル・削除 |\n| `GET /api/worlds?q=&tag=&sort=popular\\|new\\|recommended\\|favorites&author=` | — | `WorldSummary[]` |\n| `GET /api/worlds/tags`・`/api/worlds/history` | — | タグの一覧・訪れたワールド |\n| `GET /api/worlds/:id` | — | `WorldInfo`（マニフェストとファイルの基準 URL を含む） |\n| `POST /api/worlds`・`PUT /api/worlds/:id` | `.ttvw` のバイト列 | 新規登録・新しい版 |\n| `PATCH /api/worlds/:id` | `{name, description, tags, visibility}` | 変更 |\n| `DELETE /api/worlds/:id`・`GET /api/worlds/:id/export` | — | 削除・`.ttvw` の書き出し（制作者のみ。親サーバー間の移行用） |\n| `GET /api/instances?worldId=&friends=1` | — | `InstanceSummary[]`（自分が入れるもの・公開のもの） |\n| `POST /api/instances` | `{worldId, access, name?, capacity?, persistent?}` | `InstanceInfo` |\n| `GET /api/instances/:id`・`DELETE /api/instances/:id` | — | 情報・閉じる（作成者・管理者のみ） |\n| `GET /api/instances/:id/files` | — | `SharedFileInfo[]` |\n| `POST /api/instances/:id/files?name=&meta=<json>&description=` | バイト列 | `SharedFileInfo` |\n| `PATCH /api/instances/:id/files/:fileId` | `{fileName?, description?, meta?, locked?}` | 変更 |\n| `DELETE /api/instances/:id/files/:fileId` | — | 削除 |\n| `GET /api/storage/:worldId/shared`・`GET .../shared/:key` | — | `{key, value}[]`・`{value}` |\n| `PUT .../shared/:key {value}`・`POST .../shared/:key/increment {delta}`・`DELETE .../shared/:key` | — | ワールド共有の永続データ |\n| `GET /api/storage/:worldId/player?userId=`・`GET .../player/:key?userId=` | — | 利用者ごとの永続データ（他人の分も読める） |\n| `PUT/POST(increment)/DELETE .../player/:key` | — | 自分の分だけ書ける |\n| `POST /api/reports` | `ReportInput` | 通報 |\n| `GET /api/admin/reports`・`POST /api/admin/reports/:id/resolve {action: dismiss\\|ban\\|remove}` | — | 管理者のみ |\n\n静的ファイル（認証なし）:\n\n```\nGET /files/avatars/<id>.vrm\nGET /files/worlds/<id>/<版>/<パス>\nGET /files/instances/<インスタンスID>/<ファイルID>\nGET /files/icons/<id>\nGET /files/thumbs/<id>\n```\n\n`/files/` は `X-Content-Type-Options: nosniff` と `Content-Security-Policy: sandbox` 付きで配信します。インスタンス共有ファイルの HTML・XML・JavaScript・SVG は `application/octet-stream` として返します。認証がないので、URL を知っている人は誰でも取得できます。\n\nインスタンスの公開範囲と、上限・レート制限の値は [apps/server/README.md](../apps/server/README.md) にあります。\n\n---\n\n## 2. WebSocket（/ws）\n\n- URL は親サーバーの URL の `/ws`（https なら `wss:`）。\n- メッセージはすべて JSON の文字列です。バイナリのメッセージは拒否します。\n- 親サーバーは受け取ったメッセージの形を厳密に確かめ（`apps/server/src/wsmsg.ts`）、知らない種類・型の違う値・長すぎる文字列は拒否します。ID は `^[A-Za-z0-9_-]{1,64}$`。\n- 1 接続あたり 1 秒 200 メッセージまで。不正なメッセージや回数超過が 20 回を超えると切断します（10 秒間何もなければ数え直します）。\n- 親サーバーは 30 秒ごとに WebSocket の ping を送り、応答がなければ切ります。\n\n### クライアント → 親サーバー（ClientSignal）\n\n| t | 項目 | 内容 |\n|---|---|---|\n| `hello` | `token`、`protocol` | 最初に送る。10 秒以内に送らないと切断（4001） |\n| `ping` | `id`、`c` | 時計合わせ（`c` は送った時刻） |\n| `join` | `instanceId`、`hostScore`、`queue?` | インスタンスに参加。`queue` で満員なら並ぶ |\n| `leave` | — | 退出・順番待ちの取り消し |\n| `signal` | `to`、`data` | WebRTC の接続情報を相手へ |\n| `relay` | `to`（peerId か `'*'`）、`ch`（`'r'`・`'u'`）、`data` | P2P の代わりの中継（4 章） |\n| `status` | `status`、`statusText?` | オンライン状態 |\n| `p2pfail` | `peerId` | P2P がつながらなかった相手（記録のみ） |\n| `kick` | `peerId`、`reason` | 退出させる（作成者・モデレーターのみ） |\n| `renew` | — | 参加チケットの再発行 |\n\n`signal.data` は `{kind: 'offer'|'answer', sdp}`（SDP は 64KB まで）、`{kind: 'ice', candidate, sdpMid, sdpMLineIndex}`、`{kind: 'restart'}`。\n\n### 親サーバー → クライアント（ServerSignal）\n\n| t | 項目 | 内容 |\n|---|---|---|\n| `welcome` | `userId`、`serverTime` | 認証できた |\n| `pong` | `id`、`c`、`s` | `s` は親サーバーの時刻（UNIX ms） |\n| `joined` | `instance`、`peerId`、`ticket`、`peers` | 参加できた。`peers` は先にいた人の `PeerDescriptor[]` |\n| `queued` | `instanceId`、`position` | 満員で並んでいる（順番が変わるたびに届く） |\n| `peer-joined` / `peer-left` | `peer` / `peerId` | 人の出入り |\n| `signal` | `from`、`data` | 相手からの接続情報 |\n| `relay` | `from`、`ch`、`data` | 中継されたデータ |\n| `ticket` | `ticket` | 再発行したチケット |\n| `notify` | `notification` | 通知 |\n| `friend-status` | `user`、`online`、`location` | フレンドの状態 |\n| `kicked` | `reason` | 退出させられた・インスタンスが閉じた |\n| `error` | `code`、`message` | エラー |\n\n`PeerDescriptor` は `{peerId, user, joinedAt, hostScore, ticket, hidden?}` です。`peerId` は参加ごとに変わる接続 ID、`joinedAt` は親サーバーの時計で入った時刻です。どちらかがブロックしている相手は `hidden: true` になり、P2P も中継も通りません。\n\n主なエラーコード: `not_found`、`denied`（公開範囲で入れない・キックされた）、`full`、`already_joined`、`not_joined`、`peer_not_found`、`relay_disabled`、`relay_rate`、`bad_message`、`not_authenticated`、`forbidden`、`closed`、`internal`。\n\n切断のコード: `4000` プロトコルの版が違う、`4001` 認証できない・hello が来ない、`4003` 利用停止、`1008` 不正なメッセージ・回数超過が多すぎる、`1001` サーバーの終了。\n\n1 つの接続が入れるインスタンスは 1 つです。別のインスタンスに `join` すると、前のところからは抜けます。\n\n---\n\n## 3. 参加チケット\n\n親サーバーが参加者ごとに発行する、署名付きの身分証です。参加者どうしはこれを親サーバーの公開鍵で確かめるので、親サーバーが止まっていても相手が本物か確認できます。\n\n### 形\n\n```\n<本体>.<署名>\n本体 = base64url( JSON の TicketPayload を UTF-8 にしたもの )\n署名 = base64url( Ed25519 の署名 )\n```\n\nbase64url は `+` を `-`、`/` を `_` にし、末尾の `=` を取った base64 です。\n\n**署名の対象は、本体の base64url 文字列そのもの（ASCII のバイト列）**です。JSON を署名し直すのではありません（`apps/server/src/ticket.ts` の `encodeTicket`）。\n\n```ts\ninterface TicketPayload {\n  v: 1\n  sid: string   // 発行した親サーバーの serverId\n  iid: string   // インスタンス ID\n  uid: string   // 利用者 ID\n  pid: string   // 接続 ID（peerId）\n  name: string  // 表示名\n  role: 'owner' | 'moderator' | 'member'\n  iat: number   // 発行時刻（UNIX ms）\n  exp: number   // 有効期限（UNIX ms）。発行から 6 時間\n}\n```\n\n### 鍵\n\n- 親サーバーは初回起動時に Ed25519 の鍵を作り、`data/keys/ed25519.pem` に保存します。\n- 公開鍵は SPKI DER を base64url にしたもので、`/api/info` の `publicKey` です。\n- `serverId` は SPKI DER の SHA-256 を base64url にした先頭 22 文字です。\n\n### 確かめ方（クライアント、`apps/client/src/net/ticket.ts`・`session.ts`）\n\n相手の `hello` に入っているチケットについて、\n\n1. WebCrypto の Ed25519 で、本体の ASCII バイト列に対する署名を確かめる\n2. `iid` が今のインスタンス、`pid` が相手の peerId、`sid` が接続している親サーバーの serverId と一致する\n3. `exp` が今より 60 秒以上前でない\n\nを満たさなければ、その相手のメッセージを無視します。Ed25519 の検証に対応していない古いブラウザでは、署名を確かめずに中身を使います（相手の一覧は親サーバーから受け取っているため）。\n\n親サーバー側の `verifyTicket` は、さらに `iat` が 5 分より先の時刻でないことも確かめます。\n\n`renew` で新しいチケットを受け取れます（クライアントは 1 時間ごとに送ります）。\n\n---\n\n## 4. 参加者どうしの通信\n\n### 接続\n\n- インスタンスの全員が WebRTC で全員とつながります（フルメッシュ）。\n- **後から入った側**（`joinedAt` が大きい側。同じなら peerId が大きい側）が offer を出します。同時に出し合う衝突を避けるためです。\n- データチャネルは最初から 2 本決めておきます（negotiated）。\n  - id 0 `r`: 信頼性あり・順序あり。JSON のメッセージ（`PeerMessage`）\n  - id 1 `u`: 信頼性なし・順序なし（再送なし）。バイナリ（姿勢・物の位置・中継の声）\n- 音声のトランシーバー（sendrecv）も最初から作り、マイクを入れたら `replaceTrack` するだけにします（再交渉しない）。\n- ICE サーバー（STUN / TURN）は `/api/info` の `iceServers` を使います。\n- 接続が `failed` になったら ICE をやり直します（offer を出す側が `iceRestart`、反対側は `{kind: 'restart'}` を送る）。\n- `r` のメッセージは 64KB（`PEER_MESSAGE_LIMIT`）まで、`u` は 2048 バイトまで受け付けます。`u` は送信待ちが 16KB を超えたら捨てます（古い姿勢は役に立たないため）。\n\n### 中継\n\n次のときは、その相手とは親サーバーの WebSocket で話します（状態 `relay`）。\n\n- 10 秒たっても P2P が開かない\n- P2P が開いたあとで切れた（親サーバーがつながっている場合）\n- 相手から中継でメッセージが来た\n\n中継のメッセージ `{t: 'relay', to, ch, data}`:\n\n- `ch: 'r'`: `data` は `PeerMessage` の JSON 文字列\n- `ch: 'u'`: `data` はバイナリを標準の base64 にした文字列\n- `data` の長さは `ceil(65536 × 4 / 3) + 16` 文字まで\n- 親サーバーは 1 接続あたり 1 秒 64KB（`relayBytesPerSecond`、一時的には 128KB まで）を、`data の長さ × 送り先の数` で数えます。超えたぶんは捨て、`relay_rate` のエラーを返します\n- 設定 `relay: false` の親サーバーでは中継を使えません\n\n声は WebRTC の音声トラックで送れない相手（中継の相手）には、Opus にして `u` で送ります（6 章）。\n\n### 親サーバーが止まったとき\n\nP2P でつながっている相手とは、そのまま話し続けます。P2P も切れて親サーバーもない相手は `lost` になり、15 秒たつと一覧から外れます。親サーバーにつなぎ直すと、クライアントはインスタンスに入り直します。\n\n---\n\n## 5. P2P のメッセージ（PeerMessage、チャネル r）\n\n| t | 項目 | 内容 |\n|---|---|---|\n| `hello` | `v`、`ticket`、`avatar`、`allowContact`、`hostScore`、`stateEpoch` | 名乗る。つながったら（中継も含む）互いに送る |\n| `avatar` | `avatar` | アバターを変えた（`AvatarRef`） |\n| `expr` | `weights`、`gesture` | 表情の重みと左右の手の形 |\n| `chat` | `id`、`text` | チャット（300 文字まで） |\n| `typing` | `on` | 入力中 |\n| `set` | `key`、`value`、`nonce` | 同期状態の変更の依頼（ホストへ） |\n| `state` | `key`、`value`、`rev`、`by`、`nonce?` | 確定した変更（ホストから全員へ） |\n| `snapshot` | `epoch`、`host`、`entries` | 同期状態の一覧（ホストから） |\n| `reject` | `key`、`nonce`、`reason` | 変更を断った（ホストから依頼した人へ） |\n| `event` | `name`、`payload`、`target` | イベント |\n| `tping` / `tpong` | `c` / `c`、`h` | ホストとの時計合わせ |\n| `touch` | `part`、`strength` | 相手に触れた部位 |\n| `bye` | — | 抜ける |\n\n- `hello` を受け取って確かめるまでは、ほかのメッセージは無視します。初めて確かめられた相手には自分も `hello` を送り直し、自分がホストなら `snapshot` を送ります。\n- `AvatarRef` は `{kind: 'builtin', id, color, scale, outfits?}` か `{kind: 'vrm', id, url, sha256, scale, outfits?}`。受け手は `scale` を 0.1〜5 に収め、VRM は `http(s)` の URL と 64 桁の SHA-256 のものだけを受け付けます。\n- `expr` の重みは 64 個まで、0〜1 に収めます。\n- `hostScore` は受け手が 0〜100 に収めます。\n\n受け手が相手ごとに数える上限（これを超えたものは捨てる）:\n\n| 種類 | 上限 |\n|---|---|\n| `set` | 2 秒に 60 回（1 秒 30 回）。超えると `reject` |\n| `event` | 2 秒に 80 回 |\n| `chat` | 10 秒に 8 回 |\n| バイナリ（姿勢と中継の声の合計） | 2 秒に 80 個 |\n\n---\n\n## 6. バイナリの形式（チャネル u）\n\n数値はすべてリトルエンディアンです。先頭の 1 バイトで種類を見分けます（1: 姿勢、2: 物の位置、3: 声）。\n\n### 姿勢（PoseFrame、種類 1）\n\n20 回/秒で送ります。\n\n| 位置 | 型 | 内容 |\n|---|---|---|\n| 0 | u8 | 種類 = 1 |\n| 1 | u8 | 寝るポーズ（0 なし、1 仰向け、2 うつ伏せ、3 左向き、4 右向き、5 くつろぐ） |\n| 2 | u16 | 連番 |\n| 4 | u16 | フラグ（下の表） |\n| 6 | u32 | 送った時刻（共有時計の ms の下位 32 ビット） |\n| 10 | f32 × 3 | 足元の位置（ワールド座標、m） |\n| 22 | i16 | 体の向き（ラジアン ÷ π × 32767） |\n| 24 | u8 | 移動の速さ（m/s × 25） |\n| 25 | i8 | 横の移動（−1〜1 × 127） |\n| 26 | i8 | 前後の移動（−1〜1 × 127） |\n| 27 | 14 バイト | 頭 |\n| 41 | 14 バイト | 左手 |\n| 55 | 14 バイト | 右手 |\n| 69 | u8 × 10 | （フラグ Fingers のとき）指の曲がり 0〜255。左の親指〜小指、右の親指〜小指 |\n| 69 または 79 | 14 バイト × 3 | （フラグ Trackers のとき）腰・左足・右足 |\n\n「14 バイト」の点は、位置 i16 × 3（足元からの相対位置、mm）と回転 i16 × 4（四元数 x, y, z, w を正規化し、w ≥ 0 にそろえて × 32767）です。基本の大きさは 69 バイトで、受け手は大きさがフラグと合わないもの、256 バイトを超えるもの、足元の位置が 10 万 m を超えるものを捨てます。\n\n| フラグ | 値 |\n|---|---|\n| VR | 1 |\n| Grounded（接地） | 2 |\n| Crouch（しゃがみ） | 4 |\n| Prone（伏せ） | 8 |\n| Sitting（着席） | 16 |\n| HandTracking | 32 |\n| Fingers | 64 |\n| Trackers | 128 |\n| Talking | 256 |\n| Muted | 512 |\n| Jumping | 1024 |\n| Flying | 2048 |\n| Seated | 4096 |\n\n今のクライアントは Trackers・Flying・Seated を送っていません。\n\n受け手は時刻を共有時計の近くに戻して並べ、少し遅らせて前後のフレームの間を補います（2 秒より古いものは捨てる）。\n\n### 物の位置（種類 2）\n\nつかめる物の持ち主が 15 回/秒で送ります。\n\n| 位置 | 型 | 内容 |\n|---|---|---|\n| 0 | u8 | 種類 = 2 |\n| 1 | u8 | 個数 n（32 まで） |\n| 2 | u32 | 時刻（共有時計の ms の下位 32 ビット） |\n| 6 + 30i | u32 | 物の ID のハッシュ（FNV-1a 32 ビット） |\n| +4 | f32 × 3 | 位置（m） |\n| +16 | i16 × 4 | 回転（姿勢と同じ形式） |\n| +24 | i16 × 3 | 速度（m/s × 100） |\n\n大きさは `6 + 30 × n` バイトちょうどでなければ捨てます。\n\n### 声（種類 3、中継の相手だけ）\n\n```\n[0] u8  種類 = 3\n[1] u16 連番\n[3〜]   Opus のデータ 1 フレーム\n```\n\n48kHz・モノラル・24kbps・20ms ごとの Opus です（ブラウザの WebCodecs の `AudioEncoder` / `AudioDecoder` を使う）。受け手は 4〜1500 バイトのものだけを受け付け、60ms ぶんたまってから鳴らし始めます。WebCodecs や AudioWorklet が使えないブラウザでは、声の中継は動きません。\n\n---\n\n## 7. ホストの選び方\n\nホストは同期状態の順番を決める参加者です。全員が同じ規則で計算するので、話し合いはしません。\n\n候補は「自分」と「`hello` を確かめた相手のうち、状態が `lost` でない人」で、次の順に並べた先頭がホストです。\n\n1. `hostScore > 0` の人（ホストを引き受けられる人）\n2. `joinedAt` が小さい人（先に入った人）\n3. peerId が小さい人\n\nクライアントの `hostScore` は、「ホストを引き受けない」設定なら 0、スマホなら 20、それ以外は 60 です（スマホは既定で「引き受けない」がオン）。人の出入りや接続の変化があるたびに計算し直します。\n\n---\n\n## 8. 同期状態\n\nキーと値の組で、全員が複製を持ちます。\n\n- キーは `^(w|sys):[A-Za-z0-9_.\\-:/]{1,120}$`。`w:` はワールド、`sys:` はプラットフォームが使います。\n- 値は JSON で 16KB まで、キーは全部で 1024 個まで。\n\n### 流れ\n\n1. ホスト以外が変えるときは、確定待ちとして手元に置いて自分の画面に反映し、ホストへ `set {key, value, nonce}` を送ります。\n2. ホストは確かめて、通れば `rev`（通し番号）を 1 増やし、全員へ `state {key, value, rev, by, nonce}` を送ります。通らなければ依頼した人へ `reject` を送ります。\n3. 依頼した人は、自分の `nonce` の `state` が来たら確定、`reject` が来たら確定待ちを捨てて元の値に戻します。確定待ちのあいだに他人の変更が来ても、自分の画面は自分の値のままにします。\n4. ホスト自身の変更は、確かめてすぐ確定します。\n5. `sys:` のキーに `null` を書くと、そのキーは消えます（`w:` は `null` という値として残ります）。\n\n### 一覧（snapshot）\n\nホストは、新しく確かめた相手に `snapshot {epoch, host, entries}` を送ります。`entries` は `[key, value, rev, by]` の配列で、48KB を超えるときは複数に分けます。受け手は今のホストから来たものだけを使います。一覧を受け取るまでは `synced = false` です。\n\n### ホストの交代（epoch）\n\nホストが抜けて自分が新しいホストになったら、`epoch`（世代）を 1 増やし、自分の確定待ちを確定させてから、自分の複製を正として全員へ `snapshot` を送ります。ホスト以外の人は、新しいホストへ確定待ちの変更を送り直します。`hello` の `stateEpoch` は今の版では判断に使っていません。\n\n### sys: のキーの検査（ホストの validate）\n\nホストは `sys:` のキーについて、書き込める人を確かめます（`apps/client/src/net/session.ts`）。`by` は依頼した人の peerId です。\n\n| キー | 書ける条件 |\n|---|---|\n| `sys:pen:<持ち主>:...`・`sys:pin:<持ち主>:...` | 持ち主本人。消す（`null`）のは、モデレーターか、持ち主がもういないとき |\n| `sys:seat:<席ID>` | 値が自分の peerId で、席が空いている・自分・座っていた人がもういないとき。立つ（`null`）のは、自分か、空いている・座っていた人がいない・モデレーターのとき |\n| `sys:pick:<物ID>` | 値は `{holder, owner}` で、`owner` が自分、`holder` が `null` か自分。`null` も可 |\n| `sys:world:...` | 作成者・モデレーター（チケットの `role` が `member` でない人） |\n| それ以外の `sys:` | 拒否 |\n\n`w:` のキーは、キーの形・大きさ・個数の検査だけです。\n\n---\n\n## 9. イベント\n\n`event {name, payload, target}` は、送り手が相手へ直接送ります（ホストを通しません）。\n\n- `target`: `'all'`（自分も含む全員）、`'others'`、`'host'`、peerId\n- 名前は `^[A-Za-z0-9_.\\-:]{1,64}$`、中身は JSON で 8KB まで\n- ワールドのイベントの名前には `w.` を付けて送ります（`useEmit()('bell')` は `w.bell`）\n- あとから来た人には届きません\n\n---\n\n## 10. 時計合わせ\n\n### 親サーバーの時計（ふつう）\n\nクライアントは `ping {id, c}`（`c` は `performance.now()`）を送り、`pong {id, c, s}` を受け取ります。受け取った時刻を `now` として、\n\n```\nrtt    = now - c\noffset = s + rtt / 2 - (performance.timeOrigin + now)\n```\n\nを計算します。直近 12 回のうち往復時間がいちばん短い測定を使い、共有時刻は `performance.timeOrigin + performance.now() + offset` です。最初の 6 回は 0.4 秒ごと、そのあとは 10 秒ごとに測ります。\n\n誤差の上限は `rtt / 2 + 最後に測ってからの時間 × 0.0001` です。共有時刻が 250ms を超えて変わると「時刻が飛んだ」（`jumps`）として数えます。\n\n### ホストの時計（親サーバーが使えないとき）\n\n親サーバーにつながっていないときは、ホスト以外の人がホストへ 2 秒ごとに `tping {c}` を送り、ホストは `tpong {c, h}`（`h` はホストの共有時刻）を返します。計算は同じです。\n\n---\n\n## 11. バージョン\n\n| 名前 | 今の値 | 確かめる場所 |\n|---|---|---|\n| `PROTOCOL_VERSION` | `2` | クライアントは `/api/info` の `protocol`、親サーバーは `hello` の `protocol` を確かめ、違えば接続しない |\n| `PEER_PROTOCOL` | `1` | `hello` の `v` で送る（今の版では受け手は確かめていない） |\n| ワールドの `formatVersion` | `1` | 親サーバーとクライアントが確かめる |\n| `SDK_VERSION` | `'0.1.0'` | マニフェストに記録する（読み込みのときには確かめていない） |\n| アバター拡張定義の `version` | `1` | 親サーバーが確かめる |\n\n方針: 互換性のない変更をするときは、その番号を上げます。足すだけの変更（知らない項目は無視できるもの）では上げません。\n",pt=`# テストと確認

TenTenV の自動テストと、手作業で確かめる項目のまとめです。

---

## 1. 自動テスト

### 1.1 型の検査とビルド

\`\`\`sh
npm run typecheck   # すべてのパッケージの型の検査
npm run build       # protocol・sdk の型の検査 → クライアントのビルド → サーバーの型の検査
\`\`\`

### 1.2 親サーバーのテスト

\`apps/server/test/\` に node:test のテストが 28 件あります（REST API 14 件、参加チケット 1 件、WebSocket 13 件）。テストごとに一時的なデータフォルダで親サーバーを起動するので、動いている親サーバーには影響しません。

\`\`\`sh
npm test                      # すべてのパッケージ（今は親サーバーだけが対象）
npm test -w @tentenv/server   # 親サーバーだけ
\`\`\`

主な内容:

- ログイン（ゲスト・Misskey の MiAuth を模したもの）、プロフィール、ログインの回数制限
- フレンド・通知・ブロック、通報と管理者の対応
- ワールドのアップロード・配信・更新・書き出し・検索、アバターのアップロードと利用条件の読み取り、アップロードの上限
- インスタンスの公開範囲（フレンド・フレンド+・招待・招待+）、定員と順番待ち、キック、空のインスタンスの後片付け
- インスタンス共有ファイル、ワールドの永続データの上限と権限
- 参加チケットの署名・改ざん・期限・発行元の検査
- WebSocket: hello と時計合わせ、2 人の参加と信号の転送・中継・退出、1 接続 1 インスタンス、不正なメッセージと回数超過での切断、ブロック相手の hidden、中継を無効にしたサーバー
- 知らない API・メソッド・壊れた JSON

SDK（\`packages/sdk\`）にも \`npm test\` の設定（\`src/tools/*.test.ts\`）がありますが、今はテストのファイルがなく、0 件で終わります。

### 1.3 ブラウザでの自動確認（tests/e2e）

[Playwright](https://playwright.dev/)（\`playwright-core\`、ルートの開発用の依存）でブラウザを動かし、実際の画面で確かめます。

**準備**

1. Chromium 系のブラウザ。既定では \`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe\`（Windows の Edge）を使います。ほかの場所のブラウザは環境変数 \`BROWSER\` に実行ファイルのパスを入れます。
2. 親サーバーとクライアントを起動します。

   \`\`\`sh
   npm run seed          # 初回だけ（DJ ラウンジを使う dj.mjs に必要）
   npm run dev:server
   npm run dev:client    # http://127.0.0.1:5190
   \`\`\`

3. 多くのスクリプトは「テンプレートワールド」（\`worlds/template\`）を使います。標準のワールドには入っていないので、一度だけ親サーバーに登録します。クライアントにゲストで入り、「設定 → アカウント・サーバー → 制作者向け」でトークンをコピーして:

   \`\`\`sh
   cd worlds/template
   npx ttv-world upload --server http://127.0.0.1:8787 --token <トークン>
   \`\`\`

   （\`npx ttv-world pack -o template.ttvw\` で作ったファイルを、ホームの「制作」タブから登録してもかまいません。）

ヘッドレス（画面を出さない）で動き、偽のマイク・カメラ（\`--use-fake-device-for-media-stream\`）とソフトウェアの描画（SwiftShader）を使います。結果は \`[OK]\` / \`[NG]\` で表示され、失敗があると終了コードが 1 になります。

**スクリプト**

| スクリプト | 確かめること | 開発ビルド | 本番ビルド |
|---|---|---|---|
| \`smoke.mjs [URL] [ワールド名] [出力フォルダ]\` | ゲストでログイン → ワールドに入る → 2 人目が招待リンクで同じインスタンスに入る → 歩く・チャット・メニューの参加者。スクリーンショットとブラウザのエラーを出す（既定の出力 \`tests/e2e/out/\`） | ○ | ○ |
| \`portal.mjs [URL]\` | ホームに 2 人で入る → Launch Pad・下部フレンド・ワールド詳細 → ポータルの同期 → 2 人目の入場と残り時間の更新 → 床への手動配置。画像は \`tests/e2e/out/portal-*.png\` | ○ | × |
| \`visit.mjs <URL> <ワールド名> <出力の頭> [待ち ms]\` | 1 人でワールドに入り、前へ歩く前と後のスクリーンショット、エラーと警告の一覧 | ○ | ○ |
| \`interact.mjs [URL]\` | マウスの固定、照準の説明、ライトを押すと相手にも反映、箱をつかむと相手から見て持ち主が自分、持って動かした箱が相手でも動く、最初のホスト、ホストが抜けたら相手がホストを引き継ぎ状態が残る | ○ | × |
| \`mobile.mjs [URL] [ワールド名] [出力の頭]\` | スマホの画面（Pixel 7 の大きさ）: 横にはみ出さない、仮想スティックが出る、スティックで歩ける、ページのエラーがない | ○ | × |
| \`vr.mjs [URL] [ワールド名] [出力の頭]\` | WebXR のエミュレーター（Quest 3 を模したもの）: VR ボタン、VR に入れる、頭と両手の位置、メニュー | ○ | × |
| \`relay.mjs [URL] [ワールド名]\` | 2 人目の P2P 接続をテスト用に失敗させる: 自動中継に切り替わり、姿勢・チャット・声が届く | ○ | × |
| \`outage.mjs [URL]\` | 2 人が入ったあと親サーバーを止める → P2P で姿勢・チャット・同期状態が届き続ける → 親サーバーを起動し直すと自動で入り直し、相手が見える | ○ | × |
| \`dj.mjs [URL]\` | DJ ラウンジに 2 人で入り、1 人がデッキの再生ボタンを押すと、もう 1 人のミキサーの状態も変わる。ページのエラーがない | ○ | × |
| \`mirrors.mjs [URL] [出力の頭]\` | ホームワールドでフェイスミラーを出し、パーソナルミラーを取っ手で持って向きを変えると鏡がついてくる。ページのエラーがない | ○ | × |

URL を省くと \`http://127.0.0.1:5190\`（開発用のクライアント）、ワールド名を省くと「テンプレートワールド」です。

「本番ビルド ×」のスクリプトは、開発ビルドだけで使える \`window.__ttvEngine\`（中の状態をテストから見るためのもの）を使います。WebXR のエミュレーターも開発ビルドで localhost のときだけ動きます。

\`\`\`sh
node tests/e2e/smoke.mjs
node tests/e2e/interact.mjs
node tests/e2e/portal.mjs
BROWSER="/usr/bin/chromium" node tests/e2e/mobile.mjs   # ブラウザの場所を変える例
\`\`\`

別ポートのローカルサーバーで確認するときは \`E2E_SERVER\` を設定します。例: PowerShell では \`$env:E2E_SERVER='http://127.0.0.1:8797'; node tests/e2e/portal.mjs http://127.0.0.1:5197\`。このテストは WebGL の描画負荷を抑えるため、低画質・中継接続で実行します。

### ポータルの実機確認

PC ではワールド詳細から「作ってポータルを置く」を選び、床に照準を合わせてクリックします。赤いプレビューでは設置できず、青いプレビューで設置できます。Esc で中断、設定の「目の前に置く」で直接配置、Portal Prompt の有無、残り時間、入場後の時間更新を確認します。別ブラウザでも同じ位置と行き先が見えるか確かめます。VR では利き手のレイで床を狙い、トリガーで設置と入場を確認します。VR 実機での結果は機器名とビルド番号を記録してください。

**outage.mjs の注意**

Windows 専用です（\`netstat\`・\`taskkill\` を使います）。ポート 8787 で動いている親サーバーを止め、\`npm start -w @tentenv/server\` で起動し直します。親サーバーと同じデータフォルダを \`TTV_DATA\` で指定してください（開発用の既定は \`apps/server/data\`）。

\`\`\`powershell
$env:TTV_DATA = "C:\\Users\\<名前>\\Desktop\\TenTenV\\apps\\server\\data"; node tests/e2e/outage.mjs
\`\`\`

**本番ビルドで試す**

開発用の親サーバー（8787）とぶつからないように、別のポートで起動します。

\`\`\`sh
TTV_PORT=8790 npm start              # macOS・Linux
$env:TTV_PORT=8790; npm start        # Windows の PowerShell

node tests/e2e/smoke.mjs http://localhost:8790
node tests/e2e/visit.mjs http://localhost:8790 ホーム out/home
\`\`\`

\`smoke.mjs\` は、URL のポートが 5190 なら同じホストの 8787 を、それ以外なら同じオリジンを親サーバーとして使います。テンプレートワールドは、この親サーバーにも登録しておきます（データフォルダが同じなら不要）。

---

## 2. 手作業での確認項目

自動では確かめられないものです。リリースの前などに確かめてください。

### 2.1 VR ヘッドセット

- [ ] **Quest のブラウザ**: https の親サーバーに接続 → ワールドで「VR」ボタン→ VR に入れる
- [ ] 頭と両手の追従、アバターの腕の IK、足の動き（歩くと足が出る・止まると接地する）
- [ ] 左スティックで移動、右スティックで旋回（スナップ・スムーズの両方）、視野の絞り
- [ ] A でジャンプ、右スティックの押し込みでしゃがむ、Y でメニュー、B で表情・手のメニュー、X でミュート
- [ ] 利き手を左にすると左右が入れ替わる
- [ ] トリガーでボタンを押す、指先で触れて押す、グリップでつかむ・投げる
- [ ] 鏡に自分の頭が映る・一人称では自分の頭が邪魔にならない
- [ ] 身長を合わせる、座って遊ぶ、椅子に座ると視点が座面の高さになる
- [ ] 寝転ぶと 2 秒で寝るポーズになり、起き上がると戻る
- [ ] 仮想キーボードでチャット（かな入力）、ワールドの確認・入力のダイアログ
- [ ] **PC 接続型の VR**: PC のブラウザ（WebXR 対応の Chrome / Edge と SteamVR など）で同じ項目
- [ ] **Windows ネイティブクライアント（apps/desktop）**: 起動・VR 表示・入力（詳しくは apps/desktop/README.md）
- [ ] **Meta XR Simulator**: \`XR_RUNTIME_JSON\` にシミュレーターの \`meta_openxr_simulator.json\` を指定して Windows 版を起動 → VR に入る → メニュー（全タブ）・キーボード（apps/desktop/README.md の「Meta XR Simulator で確かめる」）
- [ ] **フルトラッキング**: SteamVR でトラッカーに腰・左足・右足の役割を付ける → 「トラッカーを合わせる」→ 腰と足がついてくる・相手の画面でも動く
- [ ] **SteamVR のハンドトラッキング**: Index のコントローラーで指の形が反映される
- [ ] **フェイストラッキング（OSC）**: VMC または \`/avatar/parameters\` の OSC を送る → 表情が変わる・相手にも見える

### 2.2 ハンドトラッキングと振動

- [ ] 手の関節が指に反映される、つまむと押せる、近くの物をつまんでつかめる
- [ ] 指の形から手の形（グー・チョキなど）が判定され、表情が変わる
- [ ] コントローラーで、ボタンに触れると手が振るえる・つかむと振るえる（振動の強さ 0 で止まる）

### 2.3 スマートフォン

- [ ] **Android の Chrome**: ログイン、仮想スティックで移動、なぞって見回す、タップで押す・つかむ、右下のボタン、メニュー、チャット（日本語入力）、マイク
- [ ] **iPhone の Safari**: 同じ項目（VR ボタンは出ない）。音が出るまでのタップ、マイクの許可
- [ ] 画面を回したとき・ブラウザのタブを切り替えて戻ったとき
- [ ] 画質「低」で動く（ホームワールド・DJ ラウンジ）

### 2.4 ネットワーク

- [ ] 別々のネットワーク（家の回線とスマホの回線など）の 2 人で P2P がつながる
- [ ] 厳しい NAT・会社のネットワーク: P2P がつながらないとき中継に切り替わり、姿勢・チャット・声が届く
- [ ] TURN サーバーを設定したとき、WebRTC の音声が TURN 経由で届く
- [ ] 回線が一時的に切れて戻ったとき（Wi-Fi を切り替える）の再接続
- [ ] 親サーバーを止めても P2P の相手と続けられ、戻ると入り直す

### 2.5 Misskey ログイン

- [ ] 実在の Misskey サーバー（例 misskey.io）で MiAuth の画面が出て、許可すると戻ってログインできる
- [ ] 求める権限が \`read:account\` だけ
- [ ] \`misskey.allowedHosts\` で許していないサーバーは断られる
- [ ] 表示名・アイコンが取り込まれる、\`admins\` に書いたハンドルが管理者になる

### 2.6 長時間・大人数

- [ ] 6 時間を超えて同じインスタンスにいる（参加チケットの期限は 6 時間）。そのあとに入ってきた人から、前からいる人が見えるか
- [ ] 2〜3 時間いても、メモリが増え続けない・フレームレートが落ちない（設定の「性能の表示」）
- [ ] 16 人（または定員）で入る: 声・姿勢の遅れ、CPU・回線の使用量、ホストが抜けたときの引き継ぎ、満員のときの順番待ち
- [ ] VRM のアバターが多いとき、表示する人数・距離の制限と、重いアバターの差し替え

### 2.7 そのほか

- [ ] 動画プレイヤー（mp4・HLS）の同期再生、あとから来た人の再生位置
- [ ] ワールドの永続データ（ホームの芳名帳）が、入り直しても残る
- [ ] Web カメラでの推定（表情・腕）
- [ ] 英語表示に切り替えたときの画面
`,mt=`# 使っているライブラリと素材

TenTenV が使っている外部のライブラリと、同梱している素材の一覧です。バージョンは、このリポジトリの \`package-lock.json\` で入るもの（\`node_modules/<パッケージ>/package.json\`）です。ライセンスの全文は、各パッケージに含まれるファイルを見てください。

## ライブラリ

### 実行時に使うもの

| パッケージ | バージョン | ライセンス | 使う場所 | 用途 |
|---|---|---|---|---|
| [three](https://github.com/mrdoob/three.js) | 0.186.1 | MIT | クライアント・SDK（ワールドに共有） | 3D の描画 |
| [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) | 9.8.2 | MIT | クライアント・SDK（共有） | React で three.js を書く |
| [@react-three/drei](https://github.com/pmndrs/drei) | 10.7.9 | MIT | クライアント・SDK（共有） | R3F の便利な部品 |
| [@react-three/rapier](https://github.com/pmndrs/react-three-rapier) | 2.2.0 | MIT（パッケージの package.json に記載がないため、リポジトリのライセンスによる） | クライアント・SDK（共有） | 物理演算の React 用の部品 |
| [@dimforge/rapier3d-compat](https://github.com/dimforge/rapier.js) | 0.19.2 | Apache-2.0 | クライアント（@react-three/rapier 経由） | 物理エンジン Rapier（WASM） |
| [@react-three/xr](https://github.com/pmndrs/xr) | 6.6.32 | MIT（LICENSE ファイル） | クライアント | WebXR のセッション |
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) | 3.5.5 | MIT | クライアント | VRM の読み込み・揺れもの・表情 |
| [@react-three/uikit](https://github.com/pmndrs/uikit) / @pmndrs/uikit | 1.0.77 / 1.0.77 | MIT（LICENSE ファイル。Copyright 2024 Bela Bohlender） | クライアント | ワールドの中のメニュー（画面・VR で同じ 3D の UI） |
| [@zappar/msdf-generator](https://github.com/zappar-xr/msdf-generator) | 1.2.4 | MIT | クライアントの開発（scripts/build-font.mjs） | メニューの日本語フォント（MSDF のアトラス）を作る |
| [zustand](https://github.com/pmndrs/zustand) | 5.0.16 | MIT | クライアント | 画面の状態の管理 |
| [react](https://github.com/facebook/react) | 19.3.1 | MIT | クライアント・SDK（共有） | 画面の部品 |
| [react-dom](https://github.com/facebook/react) | 19.3.1 | MIT | クライアント | 同 |
| [hls.js](https://github.com/video-dev/hls.js) | 1.7.3 | Apache-2.0 | SDK（\`MediaScreen\`） | HLS の動画の再生（ブラウザが対応していないとき） |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | MIT | 親サーバー・SDK の CLI | \`.ttvw\`（zip）の作成と展開 |
| [ws](https://github.com/websockets/ws) | 8.22.0 | MIT | 親サーバー | WebSocket |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.15 | MIT | 親サーバー・SDK の CLI | TypeScript をそのまま実行する |

- 「共有」と書いたものは、クライアントがワールドのコードに渡すので、ワールドのパッケージには入りません（[SDK.md](SDK.md) の 1 章）。
- \`@react-three/xr\` は、開発ビルドで WebXR のエミュレーターに \`iwer\`・\`@iwer/devui\`・\`@iwer/sem\`（いずれも MIT）を使います。本番ではエミュレーターを使いません。

### 開発・ビルドだけに使うもの

| パッケージ | バージョン | ライセンス | 用途 |
|---|---|---|---|
| [playwright-core](https://github.com/microsoft/playwright) | 1.64.1 | Apache-2.0 | ブラウザでの自動確認（\`tests/e2e\`） |
| [vite](https://github.com/vitejs/vite) | 8.3.5 | MIT | クライアントとワールドのビルド |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.1.2 | MIT | 同 |
| [typescript](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | 型の検査 |

\`apps/desktop\`（Windows ネイティブクライアント）の依存は、apps/desktop/README.md を見てください。

## 外部のサービス

| サービス | いつ使うか |
|---|---|
| Google の STUN サーバー（\`stun:stun.l.google.com:19302\`） | 親サーバーの \`iceServers\` の既定値。P2P の接続のとき（運営者が変えられます） |
| storage.googleapis.com | Web カメラでの推定をオンにしたとき、推定のモデルをダウンロード |
| 利用者が選んだ Misskey のサーバー | Misskey でログインするとき |

## 同梱している素材

### メニューのフォント「LINE Seed JP Bold」（apps/client/public/fonts/line-seed-jp-bold-msdf.json）

[LINE Seed JP Bold](https://github.com/google/fonts/tree/main/ofl/lineseedjp)（© LY Corporation）を MSDF のアトラス（ASCII・かな・記号・JIS 第 1 水準の漢字など 3,736 文字）に変換して同梱しています。**SIL Open Font License 1.1**。ライセンスの全文は同じフォルダの \`OFL.txt\` にあります。変換は \`scripts/build-font.mjs\`（TTF は同梱していません）。

### 標準アバター「Akane」（apps/client/src/assets/avatars/akane.vrm）

作者: **赤山みんと 様**（minto_akayama）。VRM に書かれた利用条件は **CC0**（改変・再配布・商用利用可）。作者の表示は必須ではありませんが、敬意を込めて表示しています（アバターの選択画面にも表示）。

### ホームワールド（worlds/home）

ワールドの形・テクスチャ・音は、すべてコードで作っています（MIT、TenTenV contributors）。外部の素材は使っていません。

### DJ ラウンジ（worlds/dj-lounge）

楽曲は Tricks & Traps による「Free Rhythm Game Music Pack 1 / 2」（OpenGameArt、**CC0 1.0**）を MP3 に変換して同梱しています。

| 曲名 | 収録 |
|---|---|
| Ascend | [Free Rhythm Game Music Pack 1](https://opengameart.org/content/free-rhythm-game-music-pack-1) |
| The Lab | Pack 1 |
| Vessel of Eternity | Pack 1 |
| Bow For Me | Pack 1 |
| Passing Timeline | Pack 1 |
| Glory Days | Pack 1 |
| Psychic | Pack 1 |
| Drama | [Free Rhythm Game Music Pack 2](https://opengameart.org/content/free-rhythm-game-music-pack-2) |
| Mental Corruption | Pack 2 |
| Logic or Emotions | Pack 2 |
| Stomper | Pack 2 |
| Ripped Apart | Pack 2 |
| Celebration and Fear | Pack 2 |
| What's Cooking? | Pack 2 |
| Zen Devils | Pack 2 |

- オリジナル曲（6 曲）とサンプラーの音は、このワールド用にブラウザの中で合成したものです。
- 音の高さを変える AudioWorklet（\`public/pitch-shifter.js\`）は、このワールド用に書いたコードです（MIT）。
- 一覧は \`worlds/dj-lounge/ttv-world.json\` の \`credits\` と、ワールドの中のクレジットボードにもあります。

## 利用者のコンテンツ

利用者がアップロードしたワールド・アバター・ファイルには、TenTenV のライセンスは適用されません。アバターは VRM に書かれた利用条件に、ワールドは制作者が \`credits\` などで示す条件に従ってください。
`,ht='# TenTenV 親サーバー\n\nTenTenV の親サーバーです。ログイン、プロフィール・フレンド・通知、アバターとワールドの保存と配信、インスタンスの管理と参加判定、P2P 接続の仲介（シグナリング）、P2P が張れない相手への中継、通報・ブロック、ワールドの永続データ、インスタンス共有ファイルを受け持ちます。\n\n誰でも自分の親サーバーを立てられます。利用者はクライアントの起動時に接続先の親サーバーを選びます。\n\n- Node.js 24 以上（DB は Node 標準の `node:sqlite` を使うので、追加のデータベースは不要です）\n- 依存パッケージは `ws` と `fflate` だけです\n\n## 起動\n\nリポジトリのルートで:\n\n```sh\nnpm install\nnpm run dev:server          # 開発用（ファイルを変えると再起動）\n# または\nnpm start -w @tentenv/server\n```\n\n初回起動時に `apps/server/data/` が作られ、署名用の鍵（Ed25519）も自動で作られます。既定では `http://localhost:8787` で待ち受けます。\n\nテスト:\n\n```sh\nnpm test -w @tentenv/server\nnpm run typecheck -w @tentenv/server\n```\n\nDocker Compose で起動する場合は、リポジトリのルートで `docker compose up --build -d` を実行します。設定方法と保存先は [ルートのREADME](../../README.md#docker-compose-で起動) を参照してください。\n\n## 設定\n\n設定はデータフォルダの隣にある `server.config.json`（既定では `apps/server/server.config.json`）に書きます。ひな形は `server.config.example.json` です。ファイルがなければすべて既定値で動きます。\n\n```sh\ncp apps/server/server.config.example.json apps/server/server.config.json\n```\n\n| 項目 | 既定値 | 説明 |\n|---|---|---|\n| `name` | `"TenTenV Server"` | サーバーの名前（クライアントに表示） |\n| `description` | `""` | サーバーの説明 |\n| `termsUrl` | `null` | 利用規約の URL |\n| `publicUrl` | `""` | 外から見たこのサーバーの URL（例 `https://vr.example.com`）。ワールドやアバターのファイルの URL に使います。**公開するときは必ず設定してください**。空なら `http://localhost:<port>` |\n| `port` | `8787` | 待ち受けるポート |\n| `allowGuest` | `true` | ゲストログインを許すか |\n| `allowGuestUploads` | `true` | ゲストにアバター・ワールド・共有ファイルのアップロードを許すか。公開サーバーでは `false` を推奨 |\n| `misskey.enabled` | `true` | Misskey でのログインを使うか |\n| `misskey.allowedHosts` | `null` | ログインを許す Misskey サーバー（例 `["misskey.io"]`）。`null` ならどこでも可 |\n| `limits.avatarBytes` | 100MB | アバター（VRM）の上限 |\n| `limits.worldBytes` | 300MB | ワールドパッケージ（.ttvw）の上限（展開後の合計にも適用） |\n| `limits.instanceFileBytes` | 50MB | インスタンス共有ファイル 1 つの上限 |\n| `limits.maxInstanceCapacity` | `40` | インスタンスの定員の上限 |\n| `relay` | `true` | P2P が張れない相手への WebSocket 中継を許すか |\n| `iceServers` | Google の STUN | クライアントに渡す STUN / TURN サーバー |\n| `admins` | `[]` | 管理者（Misskey のハンドル `@name@host` か利用者 ID）。ゲストは管理者になれません |\n| `corsOrigins` | `"*"` | API を呼べるクライアントのオリジン。`"*"` か `["https://client.example"]` のような配列 |\n| `trustProxy` | `false` | リバースプロキシの `X-Forwarded-For` を信用するか（プロキシの後ろに置くときは `true`） |\n| `rateLimits.authPerMinute` | `30` | IP ごとのログインの回数（1 分あたり） |\n| `rateLimits.uploadsPerMinute` | `20` | IP ごとのアップロードの回数（1 分あたり） |\n\n環境変数でも一部を上書きできます。\n\n| 環境変数 | 説明 |\n|---|---|\n| `TTV_PORT` | 待ち受けるポート |\n| `TTV_DATA` | データフォルダ（既定 `apps/server/data`）。設定ファイルはその隣の `server.config.json` を読みます |\n| `TTV_PUBLIC_URL` | `publicUrl` |\n| `TTV_CONFIG` | 設定ファイルの場所を直接指定する |\n\n## データの置き場所\n\n```\napps/server/\n├─ server.config.json\n└─ data/                  （git には入りません）\n   ├─ db.sqlite           利用者・フレンド・ワールド・通知などすべての表\n   ├─ db.sqlite-wal / -shm\n   ├─ keys/\n   │  ├─ ed25519.pem      参加チケットの署名鍵（秘密鍵。漏らさないこと）\n   │  └─ ed25519.pub      公開鍵（/api/info の publicKey と同じ）\n   └─ files/\n      ├─ avatars/<id>.vrm\n      ├─ thumbs/          アバターのサムネイル\n      ├─ icons/           利用者のアイコン\n      ├─ worlds/<id>/<版>/ ワールドの中身（world.json・world.js・アセット）。古い版も 10 個まで残します\n      └─ instances/<インスタンス ID>/<ファイル ID>  インスタンス共有ファイル\n```\n\n- ログインのトークンは SHA-256 にして保存し、元のトークンは保存しません（有効期限 30 日、使うたびに延長）。\n- Misskey から受け取ったアクセストークンはプロフィールを読んだらすぐ捨て、保存しません。\n- `serverId` は公開鍵の指紋です。**鍵を消すと serverId が変わり、別のサーバーとして扱われます**。\n\n## 本番での動かし方（リバースプロキシと TLS）\n\nWebXR とマイクは https でないと使えないので、公開するときは TLS を終端するリバースプロキシ（Caddy・nginx など）の後ろに置きます。設定は `publicUrl` を `https://...` にし、`trustProxy` を `true` にします。\n\nCaddy の例（証明書は自動で取得されます）:\n\n```\nvr.example.com {\n  reverse_proxy 127.0.0.1:8787\n  request_body {\n    max_size 320MB\n  }\n}\n```\n\nnginx の例:\n\n```nginx\nserver {\n  listen 443 ssl http2;\n  server_name vr.example.com;\n  ssl_certificate     /etc/letsencrypt/live/vr.example.com/fullchain.pem;\n  ssl_certificate_key /etc/letsencrypt/live/vr.example.com/privkey.pem;\n\n  client_max_body_size 320m;       # ワールドの上限より少し大きく\n  proxy_request_buffering off;     # 大きなアップロードをそのまま流す\n\n  location /ws {\n    proxy_pass http://127.0.0.1:8787;\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection "upgrade";\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_read_timeout 120s;\n  }\n  location / {\n    proxy_pass http://127.0.0.1:8787;\n    proxy_set_header Host $host;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n  }\n}\n```\n\n常駐させるには systemd などを使います:\n\n```ini\n[Unit]\nDescription=TenTenV server\nAfter=network.target\n\n[Service]\nWorkingDirectory=/srv/tentenv\nExecStart=/usr/bin/npm start -w @tentenv/server\nEnvironment=TTV_PUBLIC_URL=https://vr.example.com\nRestart=always\nUser=tentenv\n\n[Install]\nWantedBy=multi-user.target\n```\n\n## TURN サーバー（推奨）\n\nP2P（WebRTC）は、片方が厳しい NAT や会社のネットワークの中にいると繋がらないことがあります。データ（位置・チャットなど）と音声は親サーバーの WebSocket で中継されます（音声は WebCodecs の Opus に変換して送るため、対応していないブラウザでは届きません）。中継は親サーバーの回線と CPU を使い、遅延も増えるので、公開するサーバーでは [coturn](https://github.com/coturn/coturn) を立てることをおすすめします。TURN があれば、P2P が繋がらない相手とも WebRTC の音声のまま話せます。\n\n`/etc/turnserver.conf` の例:\n\n```\nlistening-port=3478\ntls-listening-port=5349\nfingerprint\nlt-cred-mech\nuser=tentenv:長いパスワード\nrealm=vr.example.com\ncert=/etc/letsencrypt/live/vr.example.com/fullchain.pem\npkey=/etc/letsencrypt/live/vr.example.com/privkey.pem\nno-multicast-peers\ndenied-peer-ip=10.0.0.0-10.255.255.255\ndenied-peer-ip=172.16.0.0-172.31.255.255\ndenied-peer-ip=192.168.0.0-192.168.255.255\n```\n\n`server.config.json` に追加します:\n\n```json\n"iceServers": [\n  { "urls": "stun:vr.example.com:3478" },\n  { "urls": ["turn:vr.example.com:3478", "turns:vr.example.com:5349"], "username": "tentenv", "credential": "長いパスワード" }\n]\n```\n\nこの資格情報は `/api/info` でクライアントに渡されるので、TURN 専用の使い捨てのものにしてください。\n\n## Misskey ログインの設定\n\nMisskey の MiAuth を使います。親サーバーはパスワードを受け取らず、要求する権限は `read:account`（プロフィールを読む）だけです。Misskey 側でアプリの登録は不要です。\n\n1. クライアントが `POST /api/auth/misskey/start {host, callback}` を呼ぶと、親サーバーは `https://<host>/miauth/<session>?name=TenTenV&callback=...&permission=read:account` を返します。\n2. 利用者が Misskey で許可すると、`callback` に戻ってきます。\n3. クライアントが `POST /api/auth/misskey/finish {session}` を呼ぶと、親サーバーが `https://<host>/api/miauth/<session>/check` に問い合わせ、`@username@host` の利用者としてログインさせます。\n\n特定の Misskey サーバーの利用者だけにしたいときは `misskey.allowedHosts` に並べます。管理者は `admins` に `@name@host` で書きます。\n\n## バックアップ\n\n`data/` フォルダをまるごと保存すれば復元できます。最低限、次の 2 つは必ず保存してください。\n\n- `data/keys/ed25519.pem` … なくすと serverId が変わり、発行済みのチケットも使えなくなります\n- `data/db.sqlite` … 動かしたままでもコピーできるように、SQLite のバックアップ機能を使います:\n\n```sh\nsqlite3 apps/server/data/db.sqlite ".backup \'/backup/db-$(date +%F).sqlite\'"\n```\n\n`data/files/` は大きくなるので、rsync などで差分を取るのがおすすめです。\n\n## 制限と安全対策（概要）\n\n- SQL はすべてプレースホルダで値を渡しています。\n- 入力の長さは `@tentenv/protocol` の `LIMITS` に合わせて検査します。\n- アップロードは読みながら大きさを確かめ、上限を超えた時点で 413 を返して接続を閉じます。\n- ワールドは受け付け時に SDK と同じ検査（ファイル名・SHA-256・コードの静的検査）をします。\n- アバターは glTF バイナリで、VRM（`VRMC_vrm` / `VRM`）拡張を持つものだけを受け付けます。\n- `/files/` は `X-Content-Type-Options: nosniff` と `Content-Security-Policy: sandbox` 付きで配信し、共有ファイルの HTML などはバイナリとして返します。\n- WebSocket はメッセージの形を厳密に確かめ、回数（1 秒 120 回）と中継の送信量（1 秒 64KB）を制限し、違反が続く接続は切断します。\n- ワールドの永続データ: キーは `^[A-Za-z0-9_.\\-:]{1,128}$`、値は 100KB まで、共有キー 256 個・1 人 64 個、ワールドあたり 10MB、書き込みは 1 人 1 分 30 回まで。ゲストは書けません。\n\n## インスタンスの公開範囲\n\n| 公開範囲 | 入れる人 |\n|---|---|\n| `public` | このサーバーの誰でも |\n| `friends+` | 中にいる人（と作成者）のフレンド |\n| `friends` | 作成者のフレンド |\n| `invite+` | 中にいる人から招待された人 |\n| `invite` | 作成者から招待された人 |\n\n作成者は常に入れます。作成者がブロックした人は入れません。キックされた人はそのインスタンスに入り直せません。空になったインスタンスは 5 分後に消えます（`persistent` のものは 24 時間残ります）。管理者はどのインスタンスでもモデレーターになります。\n',gt='# TenTenV デスクトップ版（Windows ネイティブクライアント）\n\nTenTenV の Web クライアントを Electron で包み、**PC につないだ VR ヘッドセットでブラウザを使わずに遊べる**ようにしたアプリです。\n\n- ページの WebXR（`navigator.xr`）を差し替え、ネイティブアドオン経由で **OpenXR**（SteamVR・Meta Quest Link・Virtual Desktop など）に出力します\n- SteamVR のライブラリに登録でき、SteamVR から起動すると自動で VR に入ります\n- VR を使わない普通のデスクトップアプリとしても使えます（ブラウザ版と同じ画面・操作）\n- クライアントは本体（`apps/client`）を無改造で使います。親サーバーはいつも通りアプリの画面で選びます\n\n```\nTenTenV クライアント（three.js + React Three Fiber + @react-three/xr）  ※無改造\n   │ navigator.xr.requestSession(\'immersive-vr\')\n   ▼\nelectron/webxr-polyfill.cjs  ページ内の WebXR 実装（XRSession / XRFrame / 入力 / 手 / XRWebGLLayer）\n   │ three がキャンバスに左右の目を横並びで描く\n   ▼\nelectron/preload.cjs         WebGPU でキャンバスを GPU コピー → 非同期で読み戻し（ページには XR 用の関数だけを公開）\n   ▼\nnative/（C++17 / N-API）     OpenXR（D3D11）: フレーム待ち・姿勢・入力・ハンドトラッキング・振動・スワップチェーンへの書き込み\n   ▼\nOpenXR ランタイム（SteamVR / Quest Link / Virtual Desktop / WMR …）\n```\n\n## 必要なもの\n\n**使うだけ（配布版）**: Windows 10 / 11（x64）、WebGPU が動く GPU（D3D12 対応）。VR で遊ぶなら OpenXR ランタイム（SteamVR など）。\n\n**ソースからビルドする**:\n\n| もの | 備考 |\n| --- | --- |\n| Node.js 22.13 以上 | リポジトリ全体の要件 |\n| Visual Studio 2022（Build Tools 可）の「C++ によるデスクトップ開発」 | MSVC と Windows SDK |\n| CMake 3.15 以上 | `cmake --version` で確認 |\n| ネット接続（初回のみ） | Electron 本体と Khronos の OpenXR SDK（ローダー）を取得します |\n\n## ビルドと起動\n\nリポジトリのルートで:\n\n```powershell\nnpm install\nnode node_modules/electron/install.js      # Electron 本体の取得（npm 11 の allowScripts でインストールスクリプトが止まる環境向け）\nnpm run build:native -w @tentenv/desktop   # OpenXR SDK を取得し、bin/tentenv_xr.node をビルド\n```\n\n起動のしかた（`apps/desktop` で実行。ルートからなら `-w @tentenv/desktop` を付ける）:\n\n```powershell\n# 開発: 別のターミナルで npm run dev:client（http://127.0.0.1:5190）を起動しておく\nnpm start\n\n# ビルド済みのクライアント（apps/client/dist）をアプリ内で開く\nnpm run build -w @tentenv/protocol -w @tentenv/sdk; npm run build -w @tentenv/client\nnpx electron . --client-url bundled\n\n# VR で起動（ワールドに入って「VR」ボタンが出たら自動で押す）\nnpm run start:vr\n```\n\n> VS Code のターミナルなど `ELECTRON_RUN_AS_NODE=1` が設定されている環境では、Electron が Node として動いてしまいます。その変数を消してから `npx electron` を実行してください（`npm run selftest` と配布版の `TenTenV.exe` は影響を受けません）。\n\n## 使い方\n\n1. 起動すると、ブラウザ版と同じ「親サーバーの選択」画面が出ます。親サーバーの URL を入れて接続し、ログインします\n2. ホーム画面の「VR モード」は初期状態でオンです。オフにした場合も、ワールド右上の **「VR」ボタン**（または **Ctrl+Shift+V**）で VR に入れます\n3. VR を終えるには、ランタイム側のメニュー（SteamVR のダッシュボードなど）か **Ctrl+Shift+X**\n\nデスクトップのウィンドウには VR 中、左目の映像が表示されます。メニューバーは **Alt** キーで出ます。\n\n| キー | 動作 |\n| --- | --- |\n| F11 | フルスクリーン |\n| Ctrl+Shift+V / Ctrl+Shift+X | VR に入る / 終了 |\n| Ctrl+Shift+C | VR の正面をリセット（いま向いている方向を正面にする） |\n| Ctrl+R | 再読み込み |\n| F12 | 開発者ツール |\n\n### コマンドラインと設定ファイル\n\n| オプション | 説明 |\n| --- | --- |\n| `--client-url <URL>` | 開くクライアント。`bundled`（同梱 / `apps/client/dist`）、`dev`（`http://127.0.0.1:5190`）も使える |\n| `--vr` | ワールドに入ったら自動で VR に入る（SteamVR から起動したときに付く） |\n| `--scale <倍率>` | ランタイムの推奨解像度に対する倍率（0.25〜2、既定 1）。重いときは 0.7〜0.8 に |\n| `--latency low\\|smooth` | `smooth`（既定）: 転送待ちでフレーム処理を止めない / `low`: 描いた画像をなるべく同じフレームで出す |\n| `--bridge native\\|ipc` | `native`（既定）: preload がアドオンを直接使う / `ipc`: preload もサンドボックス化し、アドオンはメインプロセスで動かす（画素を IPC でコピーするので遅い） |\n| `--xr-mock [controllers\\|hands\\|cycle]` | ヘッドセット無しで疑似 HMD を使う（開発・動作確認用） |\n| `--profile <フォルダ>` | ログイン状態・設定・ログの保存先（既定 `%APPDATA%\\TenTenV`）。複数アカウントを同時に使うとき |\n| `--unlock-fps` | Chromium の垂直同期を外す（`--vr` のときは既定でオン） |\n| `--devtools` | 開発者ツールを開いて起動 |\n| `--register` / `--unregister` | ウィンドウを出さずに SteamVR へ登録 / 解除して終了 |\n| `--selftest [three\\|r3f]` | 自己テスト（下記） |\n\n同じ設定は JSON の設定ファイルにも書けます（後のものほど優先。コマンドライン > 環境変数 `TENTENV_CLIENT_URL` > 設定ファイル）:\n\n- `%APPDATA%\\TenTenV\\config.json`（メニュー「TenTenV」→「設定ファイルを開く」）\n- 配布版: `TenTenV.exe` の隣の `tentenv.config.json` / 開発時: `apps/desktop/tentenv.config.json`\n\n```json\n{\n  "clientUrl": "https://client.example.org/",\n  "resolutionScale": 0.8,\n  "latency": "smooth",\n  "bridge": "native",\n  "allowedOrigins": []\n}\n```\n\n`allowedOrigins` には、ウィンドウ内で開いてよい追加のオリジンを書けます（既定ではクライアント以外のページは既定のブラウザで開きます。Misskey のログイン画面などは小さなログイン用ウィンドウで開き、クライアントに戻ってきたら閉じます）。\n\n## VR ランタイム別の使い方\n\nアプリは Windows に登録された **アクティブな OpenXR ランタイム**（レジストリ `HKLM\\SOFTWARE\\Khronos\\OpenXR\\1\\ActiveRuntime`、または環境変数 `XR_RUNTIME_JSON`）を使います。メニュー「ヘルプ」→「VR の状態」で、どのランタイムを見ているか確認できます。\n\n### SteamVR（Valve Index / Vive / Quest + Steam Link・ALVR など）\n\n1. SteamVR の設定 →「OpenXR」→「SteamVR を OpenXR ランタイムに設定」\n2. アプリのメニュー「TenTenV」→「**SteamVR のライブラリに登録**」（初回のみ）\n   - 開発中は `npm run register`（`--packaged` で `dist` の配布版を登録）。`npm run register -- --dry-run` で中身だけ確認できます\n   - SteamVR が起動していれば OpenVR の `IVRApplications` で即時に登録します。起動していなければ Steam の `config\\appconfig.json` に追記し、次回の SteamVR 起動時に反映されます（書き換え前に `.bak` を残します）\n3. SteamVR のライブラリ（ソース「非 Steam」）に「TenTenV」が出ます。そこから起動すると `--vr` 付きで起動し、ワールドに入ると自動で VR になります\n\n登録の解除はメニュー「SteamVR の登録を解除」か `npm run unregister`。アプリキーは `tentenv.client`、マニフェストは `%APPDATA%\\TenTenV\\tentenv.vrmanifest` に書かれます（配布版フォルダの `tentenv.vrmanifest` は exe からの相対パスで書いた見本です）。\n\n### Meta Quest Link / Air Link\n\n1. PC の Meta Quest Link アプリ →「設定」→「一般」→「OpenXR ランタイム」で Meta Quest Link を有効にする\n2. Link でつないだ状態で TenTenV を起動し、ワールドで「VR」を押す\n\nランタイムが対応していれば、ハンドトラッキング（`XR_EXT_hand_tracking`）とリフレッシュレートの切り替え（`XR_FB_display_refresh_rate`）も使えます（Quest Link は両方に対応しています）。\n\n### トラッカー・ハンドトラッキング・フェイストラッキング\n\n- **フルトラッキング**: ランタイムが `XR_HTCX_vive_tracker_interaction` に対応していれば（SteamVR は対応）、役割が「腰・左足・右足」のトラッカーを読みます。値はページの `XRFrame.__ttvExtra(referenceSpace).trackers` に出ます（TenTenV の拡張。WebXR にはない）。クライアントのメニュー「トラッカーを合わせる」で合わせてから使います\n- **ハンドトラッキング**: `XR_EXT_hand_tracking` の関節を、コントローラーが無いときは WebXR の `XRHand` として、コントローラーを持ったまま取れるとき（SteamVR + Index など）は `__ttvExtra(...).skeletal` として渡します\n- **フェイストラッキング（OSC）**: アプリが UDP（既定 9000、クライアントの設定で変更）で OSC を受け、ページへ渡します（`window.__tentenvOSC`）。VMC プロトコルと `/avatar/parameters` に対応します\n\n### Meta XR Simulator で確かめる\n\nシステムの OpenXR ランタイム（SteamVR など）を切り替えずに、このアプリだけをシミュレーターで動かせます。\n\n```powershell\n$env:XR_RUNTIME_JSON = "$env:APPDATA\\MetaXR\\MetaXrSimulator\\<版>\\meta_openxr_simulator.json"\nnpx electron . --client-url "http://127.0.0.1:5173/?noemu"\n```\n\n先にクライアントの開発サーバーを起動してください。シミュレーターの Inputs → Point + Click で「Enable Point + Click」を有効にすると、マウスでコントローラーのビームを向け、クリックでトリガーを操作できます。メニューのタブ切り替えまで確認しています。\n\n### Virtual Desktop\n\n- Virtual Desktop Streamer の設定で OpenXR ランタイムを **VDXR** にすると、SteamVR を経由せずに使えます\n- SteamVR 経由（VD から SteamVR を起動）でも使えます。その場合は上の SteamVR の手順に従ってください\n\n## 配布用パッケージ\n\n```powershell\nnpm run build:native -w @tentenv/desktop\nnpm run package -w @tentenv/desktop        # → apps/desktop/dist/TenTenV-win32-x64/ と TenTenV-win32-x64.zip\n```\n\n- `apps/client/dist` が無ければクライアントをビルドしてから同梱します（`--rebuild-client` で必ずビルドし直し、`--no-client` で同梱しない）\n- 同梱クライアントのオリジンは `app://tentenv` です。親サーバーの初期値は `https://tenten.marusankakusikakuonline.com/` です。別の初期値にする場合は、クライアントのビルド時に環境変数 `VITE_DEFAULT_SERVER=https://your-server.example` を設定してください\n- `RunAsNode` などの Electron のヒューズは無効化しています（配布版の exe は Node として動きません）\n\n## テスト\n\n| コマンド | 内容 |\n| --- | --- |\n| `npm test` | 単体テスト（設定・オリジン判定・`app://` のパス・SteamVR マニフェスト）+ アドオンの疎通（未ビルドならスキップ） |\n| `npm run test:native` | アドオンを Node で読み込み、疑似 HMD で 2 秒フレームを回して、提出した画素・イベント・振動・境界・リフレッシュレート・体のトラッカーを確認 |\n| `node test/native-smoke.cjs --real` | さらに本物の OpenXR ランタイムで 5 秒間、左目=青・右目=橙を表示（ヘッドセットが必要。SteamVR が起動することがあります） |\n| `npm run selftest` | Electron を起動し、疑似 HMD で three.js の WebXR（native / ipc ブリッジ）と R3F + `@react-three/xr` の `enterVR()` を確認 |\n| `npm run selftest -- --real three` | 自己テストを本物のランタイムで |\n| `TenTenV.exe --selftest three` | 配布版の自己テスト（結果は `%TEMP%\\tentenv-selftest\\`） |\n\n自己テストが確かめること: `isSessionSupported`、`requestSession`、three の `XRWebGLLayer` 経路でのキャンバスの横並び化、ビューアーの姿勢と投影行列、`local-floor` の高さ、コントローラー（`xr-standard` の buttons / axes、トリガー・A・スティック）、`gripSpace` / `targetRaySpace`、ハンドトラッキング（`hand.get()` + `getJointPose` / `fillPoses`）、`select*` / `squeeze*` / `inputsourceschange` / `visibilitychange` / `end` イベント、振動、`bounded-floor` の境界、`updateTargetFrameRate`、正面リセット（`reset` イベント）、**提出された画素がシーンの色と一致すること**（WebGPU の読み戻し → ネイティブの経路）。結果は `test/output/selftest-*.json` と `*.png` に残ります。\n\n## 仕組みの詳細\n\n- **フレームループ**: `waitFrame`（ネイティブの別スレッド）→ `beginFrame` / `locateViews` / `syncInput` → ページの XR コールバック（three が両眼を描く）→ 同じタスク内で WebGPU に GPU コピーを積む → 読み戻し → アドオンの別スレッドでステージングテクスチャへコピー → スワップチェーン → `endFrame`。画像は「それを描いたときの姿勢」と一緒に提出するので、遅れたフレームもランタイムが正しく再投影します\n- **フレーム処理**: 既定では画像転送を待たずに `endFrame` し、転送が遅れたときは直前の画像を使います。`--latency low` を指定した場合だけ、フレーム時間の 8 割を上限として転送を待ちます\n- **表示開始時の描画**: OpenXR が同期状態で `shouldRender=false` を返し続ける場合も描画を続けます。表示状態に進んだ後はランタイムの描画指示に従います\n- **基準空間**: ネイティブ側は STAGE（無ければ LOCAL_FLOOR → LOCAL）。WebXR の `local` / `local-floor` は、ブラウザと同じく「VR に入ったときの立ち位置と向き」を原点にします。`bounded-floor` はプレイエリア（`boundsGeometry` はプレイエリアの長方形）\n- **入力**（`xr-standard`）: `buttons[0]` トリガー、`[1]` グリップ、`[2]` タッチパッド、`[3]` スティック押し込み、`[4]` A / X、`[5]` B / Y、`axes[0,1]` タッチパッド、`axes[2,3]` スティック。Touch / Touch Plus / Index / Vive / WMR / simple のバインドを用意しています。プロファイル名は WebXR Input Profiles の名前（`oculus-touch-v3`、`valve-index` など）\n- **ハンドトラッキング**: `hand-tracking` を要求したページで、コントローラーを持っていない手を `XRHand`（25 関節）として出します。親指と人差し指の先が近づくと `select` になります\n- **リフレッシュレート**: `XR_FB_display_refresh_rate` に対応したランタイムでは `supportedFrameRates` / `updateTargetFrameRate` が使えます（`@react-three/xr` の `frameRate: \'high\'` が最高値を選びます）\n- **VR 中**: ページと GPU のプロセスの優先度を「高」にし、画面のスリープを止めます\n\n## セキュリティ\n\n- すべてのウィンドウで `contextIsolation: true`、`nodeIntegration: false`。ページには `window.__tentenvXR`（XR のフレームループ用の関数だけ）を公開し、Node の機能は渡しません\n- ブリッジと権限は**クライアントのオリジンだけ**に与えます（他のオリジンのページには preload がブリッジを出しません）\n- 権限: マイク・カメラ・全画面・マウスロック・クリップボードへの書き込み・出力先の選択を、クライアントのオリジンにだけ許可。それ以外とデバイス系の権限は拒否します\n- 外部のリンク（新しいウィンドウ）は既定のブラウザで開きます。ログイン画面はサンドボックス化した別ウィンドウで開きます\n- **サンドボックスについて**: 既定の `native` ブリッジでは、preload がネイティブアドオンを読むため**メインのウィンドウだけ** `sandbox: false` です（ログイン用などほかのウィンドウはサンドボックス有効）。完全にサンドボックス化したい場合は `--bridge ipc`（または設定の `"bridge": "ipc"`）にしてください。アドオンはメインプロセスで動き、preload はサンドボックスのまま動きますが、毎フレームの画素（片目 2000x2000 なら 1 フレーム約 30MB）を IPC でコピーするため、高解像度では fps が落ちます\n- 二重起動は防止し、2 回目の起動（SteamVR からの起動など）は既存のウィンドウを前に出します。ウィンドウの位置と大きさは `%APPDATA%\\TenTenV\\window-state.json` に保存します\n\n## 困ったとき\n\n| 症状 | 対処 |\n| --- | --- |\n| 「VR」ボタンが出ない | メニュー「ヘルプ」→「VR の状態」を確認。OpenXR ランタイムが登録されていないか、`bin/tentenv_xr.node` が無い（`npm run build:native`） |\n| 「VR を開始できませんでした（XR_ERROR_FORM_FACTOR_UNAVAILABLE）」 | ヘッドセットが見つかりません。接続し、ランタイム（SteamVR / Link など）を起動してから再度「VR」 |\n| 「WebGPU is not available」 | GPU ドライバを更新してください。リモートデスクトップ越しや古い GPU では WebGPU が使えません |\n| SteamVR のグリッドのまま映像が出ない / 止まる | 一部の環境（ALVR + SteamVR の OpenXR など）で OpenXR アプリが表示状態に進まないことがあります。SteamVR を再起動するか、Quest なら Quest Link / VDXR を試してください |\n| 重い・カクつく | `--scale 0.7` で解像度を下げる。ログ（下記）の `page …ms` がページ自体の 1 フレームの処理時間です（72Hz なら 13.9ms 以内が目安） |\n| 親サーバーに接続できない（CORS） | 親サーバーが接続元のオリジンを制限している場合は、サーバーの `corsOrigins` に `app://tentenv` を加えてください（既定の `*` なら不要） |\n| 開発時に「クライアントを開けませんでした」 | `npm run dev:client` が動いているか確認。または `--client-url bundled` |\n| SteamVR に登録できない | SteamVR を起動してからもう一度。止まっている場合は `appconfig.json` への追記になり、次回の SteamVR 起動で反映されます |\n| ウィンドウを閉じようとすると確認が出る | ワールドにいる間はクライアントが離脱を確認します。「退出する」で閉じます |\n\nログ: `%APPDATA%\\TenTenV\\logs\\desktop.log`（メニュー「ログのフォルダを開く」）。ページの `[TenTenV XR]` の行に、10 秒ごとの fps・ページの描画時間などが出ます。\n\n## 既知の制限\n\n- WebXR の Layers・AR（`immersive-ar`）・hit-test・アンカー・深度は未対応です（TenTenV のクライアントは使っていません）\n- 画素を CPU 経由でコピーする方式のため、GPU 間の直接共有に比べて 1 フレームあたり数 ms の転送時間がかかります\n- このリポジトリでの確認は、疑似 HMD（`--xr-mock`。トラッカーも疑似で出す）、Meta XR Simulator（Quest 3 として VR・メニューまで）、SteamVR の OpenXR ランタイムの読み込み（ヘッドセット未接続）までです。実機・実物のトラッカーでの確認はこれからです\n\n## ファイル\n\n| パス | 内容 |\n| --- | --- |\n| `electron/main.cjs` | メインプロセス（ウィンドウ・メニュー・権限・`app://` プロトコル・SteamVR 登録・自己テスト） |\n| `electron/preload.cjs` | preload（WebGPU の読み戻しとブリッジ） |\n| `electron/webxr-polyfill.cjs` | ページに注入する WebXR 実装 |\n| `electron/xr-host.cjs` | アドオンの読み込み・VR の可否判定・ipc ブリッジ |\n| `electron/config.cjs` / `protocol.cjs` / `steamvr.cjs` | 設定、`app://` の配信、SteamVR マニフェスト |\n| `native/` | OpenXR ネイティブアドオン（C++17・CMake・cmake-js）。`src/openxr_session.cpp` が本体、`src/mock_session.cpp` が疑似 HMD |\n| `scripts/` | ビルド・OpenXR SDK の取得・アイコン生成・登録・パッケージ・自己テスト |\n| `selftest/` | 自己テストのページ（three.js / R3F + `@react-three/xr`） |\n| `test/` | 単体テストとアドオンの疎通テスト |\n| `assets/` | アイコン（`npm run icons` で `apps/client/public/icon.svg` の図柄から生成） |\n| `tentenv.vrmanifest` | SteamVR 用マニフェストの見本 |\n\n## ライセンス\n\nGNU Affero General Public License v3.0（リポジトリの `LICENSE`）。同梱・参照しているサードパーティのものは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。\n',Y=n(),X=[{id:`user-guide`,path:`docs/USER_GUIDE.md`,group:`use`,icon:`book`,ja:`利用ガイド`,en:`User guide`,md:ut},{id:`desktop`,path:`apps/desktop/README.md`,group:`use`,icon:`windows`,ja:`Windows 版`,en:`Windows app`,md:gt},{id:`sdk`,path:`docs/SDK.md`,group:`build`,icon:`code`,ja:`ワールド SDK`,en:`World SDK`,md:dt},{id:`server`,path:`apps/server/README.md`,group:`build`,icon:`server`,ja:`親サーバーの運営`,en:`Hosting a server`,md:ht},{id:`protocol`,path:`docs/PROTOCOL.md`,group:`build`,icon:`wifi`,ja:`通信の仕様`,en:`Protocol`,md:ft},{id:`testing`,path:`docs/TESTING.md`,group:`project`,icon:`check`,ja:`テストと確認`,en:`Testing`,md:pt},{id:`third-party`,path:`docs/THIRD_PARTY.md`,group:`project`,icon:`shield`,ja:`ライセンス`,en:`Licenses`,md:mt}],_t=[[`use`,`使う`,`USE`],[`build`,`つくる・運営する`,`BUILD & HOST`],[`project`,`プロジェクト`,`PROJECT`]],vt={"user-guide":[`ワールド、メニュー、アバター、音声の使い方`,`Worlds, menus, avatars, and voice`],desktop:[`Windows 版の導入と VR の操作`,`Install and use the Windows app`],sdk:[`ワールド制作とアップロード`,`Create and upload worlds`],server:[`設定、公開、バックアップ`,`Configure, publish, and back up a server`],protocol:[`API、接続、同期の仕組み`,`API, connections, and synchronization`],testing:[`動作確認とトラブルの切り分け`,`Verification and troubleshooting`],"third-party":[`素材とライブラリの利用条件`,`Licenses for assets and libraries`]},Z=e=>e.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,``).replace(/\s/g,`-`),Q=e=>{let t=[];for(let n of e.split(`/`))n===`..`?t.pop():n&&n!==`.`&&t.push(n);return t.join(`/`)},$=(e,t=``)=>`${s(`docs/`)}?doc=${e}${t?`#`+t:``}`,yt=()=>{let e=new URLSearchParams(location.search).get(`doc`);return X.some(t=>t.id===e)?e:null},bt=e=>e.replace(/```[\s\S]*?```/g,` `).replace(/[#>*`|_[\]()-]/g,` `).replace(/\s+/g,` `),xt=e=>{let t=e.trim().toLowerCase();if(t.length<2)return[];let n=[];for(let e of X){let r=e.md.split(/^(?=#{1,3} )/m);for(let i of r){let r=/^#{1,3} (.*)/.exec(i)?.[1]??e.ja,a=bt(i),o=a.toLowerCase().indexOf(t);if(!(o<0)&&(n.push({doc:e,heading:r,snippet:(o>40?`…`:``)+a.slice(Math.max(0,o-40),o+t.length+60).trim()+`…`}),n.length>=30))return n}}return n};(0,u.createRoot)(document.getElementById(`root`)).render((0,Y.jsx)(()=>{let n=a(),[r,o]=(0,l.useState)(yt),[u,d]=(0,l.useState)(``),[f,p]=(0,l.useState)([]),[m,h]=(0,l.useState)(``),g=(0,l.useRef)(null),_=X.find(e=>e.id===r)??null,v=(0,l.useMemo)(()=>_?J.parse(_.md,{async:!1,gfm:!0}):``,[_]),y=(0,l.useMemo)(()=>xt(u),[u]);(0,l.useEffect)(()=>{document.documentElement.classList.add(`docs-theme`);let e=()=>o(yt());return window.addEventListener(`popstate`,e),()=>{document.documentElement.classList.remove(`docs-theme`),window.removeEventListener(`popstate`,e)}},[]);let b=(e,t=``)=>{history.pushState(null,``,e?$(e,t):s(`docs/`)),o(e),d(``),t||window.scrollTo({top:0})};return(0,l.useEffect)(()=>{document.title=_?`${i(_.ja,_.en)} — TenTenV Docs`:`TenTenV Docs`;let t=g.current;if(!t)return;let n=new Map,r=[];if(!_){p([]);return}t.querySelectorAll(`h1, h2, h3`).forEach(e=>{let t=Z(e.textContent??``),i=n.get(t)??0;n.set(t,i+1),e.id=i?`${t}-${i}`:t,e.tagName!==`H1`&&r.push({id:e.id,text:e.textContent??``,level:e.tagName===`H2`?2:3})}),p(r);let a=_.path.split(`/`).slice(0,-1).join(`/`);t.querySelectorAll(`a[href]`).forEach(t=>{let n=t.getAttribute(`href`);if(/^[a-z]+:/i.test(n)){t.target=`_blank`,t.rel=`noopener`;return}if(n.startsWith(`#`))return;let[r,i=``]=n.split(`#`),o=X.find(e=>e.path===Q(`${a}/${r}`)||e.path===Q(r));o?(t.href=$(o.id,i),t.onclick=e=>{e.preventDefault(),b(o.id,decodeURIComponent(i))}):r.endsWith(`.md`)&&(t.href=`${e}/blob/main/${Q(`${a}/${r}`)}${i?`#${i}`:``}`,t.target=`_blank`,t.rel=`noopener noreferrer`)});let o=decodeURIComponent(location.hash.slice(1));o&&requestAnimationFrame(()=>document.getElementById(o)?.scrollIntoView())},[v,_]),(0,l.useEffect)(()=>{let e=()=>{let e=``;for(let t of f){let n=document.getElementById(t.id);n&&n.getBoundingClientRect().top<120&&(e=t.id)}h(e)};return e(),window.addEventListener(`scroll`,e,{passive:!0}),()=>window.removeEventListener(`scroll`,e)},[f]),(0,Y.jsxs)(`div`,{className:`docs-app`,children:[(0,Y.jsx)(`header`,{className:`docs-topbar`,children:(0,Y.jsxs)(`div`,{className:`docs-width docs-topbar-inner`,children:[(0,Y.jsxs)(`a`,{className:`docs-brand`,href:s(`docs/`),onClick:e=>{e.preventDefault(),b(null)},children:[(0,Y.jsx)(`span`,{className:`docs-brand-mark`,children:`T`}),(0,Y.jsxs)(`span`,{children:[`TenTenV `,(0,Y.jsx)(`strong`,{children:`Docs`})]})]}),(0,Y.jsxs)(`nav`,{"aria-label":i(`サイト`,`Site`),children:[(0,Y.jsx)(`a`,{href:s(`docs/`),onClick:e=>{e.preventDefault(),b(null)},children:i(`ガイド`,`Guide`)}),(0,Y.jsx)(`a`,{href:e,target:`_blank`,rel:`noopener noreferrer`,children:`GitHub ↗`}),(0,Y.jsx)(`button`,{onClick:()=>t(n===`ja`?`en`:`ja`),children:n===`ja`?`EN`:`日本語`})]})]})}),(0,Y.jsx)(`div`,{className:`docs-search-band`,children:(0,Y.jsx)(`div`,{className:`docs-width`,children:(0,Y.jsxs)(`label`,{className:`docs-search-box`,children:[(0,Y.jsx)(c,{name:`search`,size:19}),(0,Y.jsx)(`input`,{value:u,onChange:e=>d(e.target.value),placeholder:i(`ドキュメントを検索`,`Search documentation`),"aria-label":i(`ドキュメントを検索`,`Search documentation`)}),(0,Y.jsx)(`kbd`,{children:`⌕`})]})})}),(0,Y.jsx)(`div`,{className:`docs-width`,children:u.trim().length>=2?(0,Y.jsxs)(`main`,{className:`docs-results`,"aria-live":`polite`,children:[(0,Y.jsx)(`span`,{className:`docs-eyebrow`,children:`SEARCH`}),(0,Y.jsxs)(`h1`,{children:[i(`検索結果`,`Search results`),` `,(0,Y.jsx)(`small`,{children:y.length})]}),y.length?y.map((e,t)=>(0,Y.jsxs)(`a`,{href:$(e.doc.id,Z(e.heading)),onClick:t=>{t.preventDefault(),b(e.doc.id,Z(e.heading))},children:[(0,Y.jsx)(`small`,{children:i(e.doc.ja,e.doc.en)}),(0,Y.jsx)(`strong`,{children:e.heading}),(0,Y.jsx)(`p`,{children:e.snippet})]},`${e.doc.id}-${t}`)):(0,Y.jsx)(`p`,{className:`muted`,children:i(`一致する項目がありません。別の言葉で検索してください。`,`No matches. Try another search term.`)})]}):_?(0,Y.jsxs)(`div`,{className:`docs-reader`,children:[(0,Y.jsxs)(`aside`,{className:`docs-reader-nav`,"aria-label":i(`ドキュメントの一覧`,`Document navigation`),children:[(0,Y.jsxs)(`a`,{className:`docs-back`,href:s(`docs/`),onClick:e=>{e.preventDefault(),b(null)},children:[`← `,i(`すべてのガイド`,`All guides`)]}),_t.map(([e,t,n])=>(0,Y.jsxs)(`div`,{className:`docs-nav-group`,children:[(0,Y.jsx)(`span`,{children:i(t,n)}),X.filter(t=>t.group===e).map(e=>(0,Y.jsx)(`a`,{className:e.id===r?`selected`:``,href:$(e.id),onClick:t=>{t.preventDefault(),b(e.id)},children:i(e.ja,e.en)},e.id))]},e))]}),(0,Y.jsxs)(`main`,{className:`docs-reader-main`,children:[(0,Y.jsxs)(`div`,{className:`docs-breadcrumb`,children:[(0,Y.jsx)(`a`,{href:s(`docs/`),onClick:e=>{e.preventDefault(),b(null)},children:`Docs`}),(0,Y.jsx)(`span`,{children:`/`}),(0,Y.jsx)(`span`,{children:i(_.ja,_.en)})]}),(0,Y.jsxs)(`div`,{className:`docs-reader-intro`,children:[(0,Y.jsx)(`span`,{className:`docs-eyebrow`,children:i(`ガイド`,`GUIDE`)}),(0,Y.jsx)(`p`,{children:i(...vt[_.id])})]}),f.length>0&&(0,Y.jsxs)(`details`,{className:`docs-inline-toc`,children:[(0,Y.jsxs)(`summary`,{children:[i(`このページの内容`,`On this page`),` `,(0,Y.jsx)(`span`,{children:`＋`})]}),(0,Y.jsx)(`div`,{children:f.map(e=>(0,Y.jsx)(`a`,{className:`${e.level===3?`nested `:``}${m===e.id?`selected`:``}`,href:`#${e.id}`,children:e.text},e.id))})]}),(0,Y.jsx)(`article`,{className:`md`,ref:g,dangerouslySetInnerHTML:{__html:v}}),(0,Y.jsxs)(`div`,{className:`docs-end`,children:[(0,Y.jsxs)(`a`,{href:s(`docs/`),onClick:e=>{e.preventDefault(),b(null)},children:[`← `,i(`ガイド一覧に戻る`,`Back to all guides`)]}),(0,Y.jsxs)(`a`,{href:`${e}/blob/main/${_.path}`,target:`_blank`,rel:`noopener noreferrer`,children:[i(`原文を見る`,`View source`),` ↗`]})]})]})]}):(0,Y.jsxs)(`main`,{className:`docs-home`,children:[(0,Y.jsx)(`div`,{className:`docs-home-hero`,children:(0,Y.jsxs)(`div`,{children:[(0,Y.jsx)(`span`,{className:`docs-eyebrow`,children:`TENTENV DOCUMENTATION`}),(0,Y.jsx)(`h1`,{children:i(`TenTenV ドキュメント`,`TenTenV Documentation`)}),(0,Y.jsx)(`p`,{children:i(`遊び方、ワールド制作、サーバー運営に必要な情報をまとめています。`,`Guides for playing, creating worlds, and hosting a server.`)}),(0,Y.jsxs)(`a`,{className:`docs-start`,href:$(`user-guide`),onClick:e=>{e.preventDefault(),b(`user-guide`)},children:[i(`使い方から始める`,`Start with the guide`),` `,(0,Y.jsx)(`span`,{children:`↗`})]})]})}),_t.map(([e,t,n])=>(0,Y.jsxs)(`section`,{className:`docs-home-group`,children:[(0,Y.jsxs)(`div`,{className:`docs-group-heading`,children:[(0,Y.jsx)(`span`,{children:i(t,n)}),(0,Y.jsx)(`i`,{})]}),(0,Y.jsx)(`div`,{className:`docs-card-grid`,children:X.filter(t=>t.group===e).map(e=>(0,Y.jsxs)(`a`,{className:`docs-card`,href:$(e.id),onClick:t=>{t.preventDefault(),b(e.id)},children:[(0,Y.jsx)(`span`,{className:`docs-card-icon`,children:(0,Y.jsx)(c,{name:e.icon,size:24})}),(0,Y.jsx)(`strong`,{children:i(e.ja,e.en)}),(0,Y.jsx)(`p`,{children:i(...vt[e.id])}),(0,Y.jsx)(`span`,{className:`docs-card-arrow`,children:`↗`})]},e.id))})]},e))]})}),(0,Y.jsx)(`footer`,{className:`docs-footer`,children:(0,Y.jsxs)(`div`,{className:`docs-width`,children:[(0,Y.jsx)(`span`,{children:`TenTenV Docs`}),(0,Y.jsx)(`a`,{href:e,target:`_blank`,rel:`noopener noreferrer`,children:`GitHub ↗`})]})})]})},{}));