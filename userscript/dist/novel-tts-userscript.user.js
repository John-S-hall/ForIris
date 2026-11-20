// ==UserScript==
// @name         NovelTTS-Userscript
// @namespace    https://github.com/John-S-hall/ForIris
// @version      0.1.0
// @description  移动端网页小说听书油猴脚本
// @match        *://*/*
// @connect      *
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  var Readability$1 = { exports: {} };
  (function(module) {
    function Readability2(doc, options) {
      if (options && options.documentElement) {
        doc = options;
        options = arguments[2];
      } else if (!doc || !doc.documentElement) {
        throw new Error("First argument to Readability constructor should be a document object.");
      }
      options = options || {};
      this._doc = doc;
      this._docJSDOMParser = this._doc.firstChild.__JSDOMParser__;
      this._articleTitle = null;
      this._articleByline = null;
      this._articleDir = null;
      this._articleSiteName = null;
      this._attempts = [];
      this._debug = !!options.debug;
      this._maxElemsToParse = options.maxElemsToParse || this.DEFAULT_MAX_ELEMS_TO_PARSE;
      this._nbTopCandidates = options.nbTopCandidates || this.DEFAULT_N_TOP_CANDIDATES;
      this._charThreshold = options.charThreshold || this.DEFAULT_CHAR_THRESHOLD;
      this._classesToPreserve = this.CLASSES_TO_PRESERVE.concat(options.classesToPreserve || []);
      this._keepClasses = !!options.keepClasses;
      this._serializer = options.serializer || function(el) {
        return el.innerHTML;
      };
      this._disableJSONLD = !!options.disableJSONLD;
      this._allowedVideoRegex = options.allowedVideoRegex || this.REGEXPS.videos;
      this._flags = this.FLAG_STRIP_UNLIKELYS | this.FLAG_WEIGHT_CLASSES | this.FLAG_CLEAN_CONDITIONALLY;
      if (this._debug) {
        let logNode = function(node) {
          if (node.nodeType == node.TEXT_NODE) {
            return `${node.nodeName} ("${node.textContent}")`;
          }
          let attrPairs = Array.from(node.attributes || [], function(attr) {
            return `${attr.name}="${attr.value}"`;
          }).join(" ");
          return `<${node.localName} ${attrPairs}>`;
        };
        this.log = function() {
          if (typeof console !== "undefined") {
            let args = Array.from(arguments, (arg) => {
              if (arg && arg.nodeType == this.ELEMENT_NODE) {
                return logNode(arg);
              }
              return arg;
            });
            args.unshift("Reader: (Readability)");
            console.log.apply(console, args);
          } else if (typeof dump !== "undefined") {
            var msg = Array.prototype.map.call(arguments, function(x) {
              return x && x.nodeName ? logNode(x) : x;
            }).join(" ");
            dump("Reader: (Readability) " + msg + "\n");
          }
        };
      } else {
        this.log = function() {
        };
      }
    }
    Readability2.prototype = {
      FLAG_STRIP_UNLIKELYS: 1,
      FLAG_WEIGHT_CLASSES: 2,
      FLAG_CLEAN_CONDITIONALLY: 4,
      // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
      // Max number of nodes supported by this parser. Default: 0 (no limit)
      DEFAULT_MAX_ELEMS_TO_PARSE: 0,
      // The number of top candidates to consider when analysing how
      // tight the competition is among candidates.
      DEFAULT_N_TOP_CANDIDATES: 5,
      // Element tags to score by default.
      DEFAULT_TAGS_TO_SCORE: "section,h2,h3,h4,h5,h6,p,td,pre".toUpperCase().split(","),
      // The default number of chars an article must have in order to return a result
      DEFAULT_CHAR_THRESHOLD: 500,
      // All of the regular expressions in use within readability.
      // Defined up here so we don't instantiate them repeatedly in loops.
      REGEXPS: {
        // NOTE: These two regular expressions are duplicated in
        // Readability-readerable.js. Please keep both copies in sync.
        unlikelyCandidates: /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
        okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i,
        positive: /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i,
        negative: /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget/i,
        extraneous: /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility/i,
        byline: /byline|author|dateline|writtenby|p-author/i,
        replaceFonts: /<(\/?)font[^>]*>/gi,
        normalize: /\s{2,}/g,
        videos: /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i,
        shareElements: /(\b|_)(share|sharedaddy)(\b|_)/i,
        nextLink: /(next|weiter|continue|>([^\|]|$)|»([^\|]|$))/i,
        prevLink: /(prev|earl|old|new|<|«)/i,
        tokenize: /\W+/g,
        whitespace: /^\s*$/,
        hasContent: /\S$/,
        hashUrl: /^#.+/,
        srcsetUrl: /(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))/g,
        b64DataUrl: /^data:\s*([^\s;,]+)\s*;\s*base64\s*,/i,
        // Commas as used in Latin, Sindhi, Chinese and various other scripts.
        // see: https://en.wikipedia.org/wiki/Comma#Comma_variants
        commas: /\u002C|\u060C|\uFE50|\uFE10|\uFE11|\u2E41|\u2E34|\u2E32|\uFF0C/g,
        // See: https://schema.org/Article
        jsonLdArticleTypes: /^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$/
      },
      UNLIKELY_ROLES: ["menu", "menubar", "complementary", "navigation", "alert", "alertdialog", "dialog"],
      DIV_TO_P_ELEMS: /* @__PURE__ */ new Set(["BLOCKQUOTE", "DL", "DIV", "IMG", "OL", "P", "PRE", "TABLE", "UL"]),
      ALTER_TO_DIV_EXCEPTIONS: ["DIV", "ARTICLE", "SECTION", "P"],
      PRESENTATIONAL_ATTRIBUTES: ["align", "background", "bgcolor", "border", "cellpadding", "cellspacing", "frame", "hspace", "rules", "style", "valign", "vspace"],
      DEPRECATED_SIZE_ATTRIBUTE_ELEMS: ["TABLE", "TH", "TD", "HR", "PRE"],
      // The commented out elements qualify as phrasing content but tend to be
      // removed by readability when put into paragraphs, so we ignore them here.
      PHRASING_ELEMS: [
        // "CANVAS", "IFRAME", "SVG", "VIDEO",
        "ABBR",
        "AUDIO",
        "B",
        "BDO",
        "BR",
        "BUTTON",
        "CITE",
        "CODE",
        "DATA",
        "DATALIST",
        "DFN",
        "EM",
        "EMBED",
        "I",
        "IMG",
        "INPUT",
        "KBD",
        "LABEL",
        "MARK",
        "MATH",
        "METER",
        "NOSCRIPT",
        "OBJECT",
        "OUTPUT",
        "PROGRESS",
        "Q",
        "RUBY",
        "SAMP",
        "SCRIPT",
        "SELECT",
        "SMALL",
        "SPAN",
        "STRONG",
        "SUB",
        "SUP",
        "TEXTAREA",
        "TIME",
        "VAR",
        "WBR"
      ],
      // These are the classes that readability sets itself.
      CLASSES_TO_PRESERVE: ["page"],
      // These are the list of HTML entities that need to be escaped.
      HTML_ESCAPE_MAP: {
        "lt": "<",
        "gt": ">",
        "amp": "&",
        "quot": '"',
        "apos": "'"
      },
      /**
       * Run any post-process modifications to article content as necessary.
       *
       * @param Element
       * @return void
      **/
      _postProcessContent: function(articleContent) {
        this._fixRelativeUris(articleContent);
        this._simplifyNestedElements(articleContent);
        if (!this._keepClasses) {
          this._cleanClasses(articleContent);
        }
      },
      /**
       * Iterates over a NodeList, calls `filterFn` for each node and removes node
       * if function returned `true`.
       *
       * If function is not passed, removes all the nodes in node list.
       *
       * @param NodeList nodeList The nodes to operate on
       * @param Function filterFn the function to use as a filter
       * @return void
       */
      _removeNodes: function(nodeList, filterFn) {
        if (this._docJSDOMParser && nodeList._isLiveNodeList) {
          throw new Error("Do not pass live node lists to _removeNodes");
        }
        for (var i = nodeList.length - 1; i >= 0; i--) {
          var node = nodeList[i];
          var parentNode = node.parentNode;
          if (parentNode) {
            if (!filterFn || filterFn.call(this, node, i, nodeList)) {
              parentNode.removeChild(node);
            }
          }
        }
      },
      /**
       * Iterates over a NodeList, and calls _setNodeTag for each node.
       *
       * @param NodeList nodeList The nodes to operate on
       * @param String newTagName the new tag name to use
       * @return void
       */
      _replaceNodeTags: function(nodeList, newTagName) {
        if (this._docJSDOMParser && nodeList._isLiveNodeList) {
          throw new Error("Do not pass live node lists to _replaceNodeTags");
        }
        for (const node of nodeList) {
          this._setNodeTag(node, newTagName);
        }
      },
      /**
       * Iterate over a NodeList, which doesn't natively fully implement the Array
       * interface.
       *
       * For convenience, the current object context is applied to the provided
       * iterate function.
       *
       * @param  NodeList nodeList The NodeList.
       * @param  Function fn       The iterate function.
       * @return void
       */
      _forEachNode: function(nodeList, fn) {
        Array.prototype.forEach.call(nodeList, fn, this);
      },
      /**
       * Iterate over a NodeList, and return the first node that passes
       * the supplied test function
       *
       * For convenience, the current object context is applied to the provided
       * test function.
       *
       * @param  NodeList nodeList The NodeList.
       * @param  Function fn       The test function.
       * @return void
       */
      _findNode: function(nodeList, fn) {
        return Array.prototype.find.call(nodeList, fn, this);
      },
      /**
       * Iterate over a NodeList, return true if any of the provided iterate
       * function calls returns true, false otherwise.
       *
       * For convenience, the current object context is applied to the
       * provided iterate function.
       *
       * @param  NodeList nodeList The NodeList.
       * @param  Function fn       The iterate function.
       * @return Boolean
       */
      _someNode: function(nodeList, fn) {
        return Array.prototype.some.call(nodeList, fn, this);
      },
      /**
       * Iterate over a NodeList, return true if all of the provided iterate
       * function calls return true, false otherwise.
       *
       * For convenience, the current object context is applied to the
       * provided iterate function.
       *
       * @param  NodeList nodeList The NodeList.
       * @param  Function fn       The iterate function.
       * @return Boolean
       */
      _everyNode: function(nodeList, fn) {
        return Array.prototype.every.call(nodeList, fn, this);
      },
      /**
       * Concat all nodelists passed as arguments.
       *
       * @return ...NodeList
       * @return Array
       */
      _concatNodeLists: function() {
        var slice = Array.prototype.slice;
        var args = slice.call(arguments);
        var nodeLists = args.map(function(list) {
          return slice.call(list);
        });
        return Array.prototype.concat.apply([], nodeLists);
      },
      _getAllNodesWithTag: function(node, tagNames) {
        if (node.querySelectorAll) {
          return node.querySelectorAll(tagNames.join(","));
        }
        return [].concat.apply([], tagNames.map(function(tag) {
          var collection = node.getElementsByTagName(tag);
          return Array.isArray(collection) ? collection : Array.from(collection);
        }));
      },
      /**
       * Removes the class="" attribute from every element in the given
       * subtree, except those that match CLASSES_TO_PRESERVE and
       * the classesToPreserve array from the options object.
       *
       * @param Element
       * @return void
       */
      _cleanClasses: function(node) {
        var classesToPreserve = this._classesToPreserve;
        var className = (node.getAttribute("class") || "").split(/\s+/).filter(function(cls) {
          return classesToPreserve.indexOf(cls) != -1;
        }).join(" ");
        if (className) {
          node.setAttribute("class", className);
        } else {
          node.removeAttribute("class");
        }
        for (node = node.firstElementChild; node; node = node.nextElementSibling) {
          this._cleanClasses(node);
        }
      },
      /**
       * Converts each <a> and <img> uri in the given element to an absolute URI,
       * ignoring #ref URIs.
       *
       * @param Element
       * @return void
       */
      _fixRelativeUris: function(articleContent) {
        var baseURI = this._doc.baseURI;
        var documentURI = this._doc.documentURI;
        function toAbsoluteURI(uri) {
          if (baseURI == documentURI && uri.charAt(0) == "#") {
            return uri;
          }
          try {
            return new URL(uri, baseURI).href;
          } catch (ex) {
          }
          return uri;
        }
        var links = this._getAllNodesWithTag(articleContent, ["a"]);
        this._forEachNode(links, function(link) {
          var href = link.getAttribute("href");
          if (href) {
            if (href.indexOf("javascript:") === 0) {
              if (link.childNodes.length === 1 && link.childNodes[0].nodeType === this.TEXT_NODE) {
                var text = this._doc.createTextNode(link.textContent);
                link.parentNode.replaceChild(text, link);
              } else {
                var container = this._doc.createElement("span");
                while (link.firstChild) {
                  container.appendChild(link.firstChild);
                }
                link.parentNode.replaceChild(container, link);
              }
            } else {
              link.setAttribute("href", toAbsoluteURI(href));
            }
          }
        });
        var medias = this._getAllNodesWithTag(articleContent, [
          "img",
          "picture",
          "figure",
          "video",
          "audio",
          "source"
        ]);
        this._forEachNode(medias, function(media) {
          var src = media.getAttribute("src");
          var poster = media.getAttribute("poster");
          var srcset = media.getAttribute("srcset");
          if (src) {
            media.setAttribute("src", toAbsoluteURI(src));
          }
          if (poster) {
            media.setAttribute("poster", toAbsoluteURI(poster));
          }
          if (srcset) {
            var newSrcset = srcset.replace(this.REGEXPS.srcsetUrl, function(_, p1, p2, p3) {
              return toAbsoluteURI(p1) + (p2 || "") + p3;
            });
            media.setAttribute("srcset", newSrcset);
          }
        });
      },
      _simplifyNestedElements: function(articleContent) {
        var node = articleContent;
        while (node) {
          if (node.parentNode && ["DIV", "SECTION"].includes(node.tagName) && !(node.id && node.id.startsWith("readability"))) {
            if (this._isElementWithoutContent(node)) {
              node = this._removeAndGetNext(node);
              continue;
            } else if (this._hasSingleTagInsideElement(node, "DIV") || this._hasSingleTagInsideElement(node, "SECTION")) {
              var child = node.children[0];
              for (var i = 0; i < node.attributes.length; i++) {
                child.setAttribute(node.attributes[i].name, node.attributes[i].value);
              }
              node.parentNode.replaceChild(child, node);
              node = child;
              continue;
            }
          }
          node = this._getNextNode(node);
        }
      },
      /**
       * Get the article title as an H1.
       *
       * @return string
       **/
      _getArticleTitle: function() {
        var doc = this._doc;
        var curTitle = "";
        var origTitle = "";
        try {
          curTitle = origTitle = doc.title.trim();
          if (typeof curTitle !== "string")
            curTitle = origTitle = this._getInnerText(doc.getElementsByTagName("title")[0]);
        } catch (e) {
        }
        var titleHadHierarchicalSeparators = false;
        function wordCount(str) {
          return str.split(/\s+/).length;
        }
        if (/ [\|\-\\\/>»] /.test(curTitle)) {
          titleHadHierarchicalSeparators = / [\\\/>»] /.test(curTitle);
          curTitle = origTitle.replace(/(.*)[\|\-\\\/>»] .*/gi, "$1");
          if (wordCount(curTitle) < 3)
            curTitle = origTitle.replace(/[^\|\-\\\/>»]*[\|\-\\\/>»](.*)/gi, "$1");
        } else if (curTitle.indexOf(": ") !== -1) {
          var headings = this._concatNodeLists(
            doc.getElementsByTagName("h1"),
            doc.getElementsByTagName("h2")
          );
          var trimmedTitle = curTitle.trim();
          var match = this._someNode(headings, function(heading) {
            return heading.textContent.trim() === trimmedTitle;
          });
          if (!match) {
            curTitle = origTitle.substring(origTitle.lastIndexOf(":") + 1);
            if (wordCount(curTitle) < 3) {
              curTitle = origTitle.substring(origTitle.indexOf(":") + 1);
            } else if (wordCount(origTitle.substr(0, origTitle.indexOf(":"))) > 5) {
              curTitle = origTitle;
            }
          }
        } else if (curTitle.length > 150 || curTitle.length < 15) {
          var hOnes = doc.getElementsByTagName("h1");
          if (hOnes.length === 1)
            curTitle = this._getInnerText(hOnes[0]);
        }
        curTitle = curTitle.trim().replace(this.REGEXPS.normalize, " ");
        var curTitleWordCount = wordCount(curTitle);
        if (curTitleWordCount <= 4 && (!titleHadHierarchicalSeparators || curTitleWordCount != wordCount(origTitle.replace(/[\|\-\\\/>»]+/g, "")) - 1)) {
          curTitle = origTitle;
        }
        return curTitle;
      },
      /**
       * Prepare the HTML document for readability to scrape it.
       * This includes things like stripping javascript, CSS, and handling terrible markup.
       *
       * @return void
       **/
      _prepDocument: function() {
        var doc = this._doc;
        this._removeNodes(this._getAllNodesWithTag(doc, ["style"]));
        if (doc.body) {
          this._replaceBrs(doc.body);
        }
        this._replaceNodeTags(this._getAllNodesWithTag(doc, ["font"]), "SPAN");
      },
      /**
       * Finds the next node, starting from the given node, and ignoring
       * whitespace in between. If the given node is an element, the same node is
       * returned.
       */
      _nextNode: function(node) {
        var next = node;
        while (next && next.nodeType != this.ELEMENT_NODE && this.REGEXPS.whitespace.test(next.textContent)) {
          next = next.nextSibling;
        }
        return next;
      },
      /**
       * Replaces 2 or more successive <br> elements with a single <p>.
       * Whitespace between <br> elements are ignored. For example:
       *   <div>foo<br>bar<br> <br><br>abc</div>
       * will become:
       *   <div>foo<br>bar<p>abc</p></div>
       */
      _replaceBrs: function(elem) {
        this._forEachNode(this._getAllNodesWithTag(elem, ["br"]), function(br) {
          var next = br.nextSibling;
          var replaced = false;
          while ((next = this._nextNode(next)) && next.tagName == "BR") {
            replaced = true;
            var brSibling = next.nextSibling;
            next.parentNode.removeChild(next);
            next = brSibling;
          }
          if (replaced) {
            var p = this._doc.createElement("p");
            br.parentNode.replaceChild(p, br);
            next = p.nextSibling;
            while (next) {
              if (next.tagName == "BR") {
                var nextElem = this._nextNode(next.nextSibling);
                if (nextElem && nextElem.tagName == "BR")
                  break;
              }
              if (!this._isPhrasingContent(next))
                break;
              var sibling = next.nextSibling;
              p.appendChild(next);
              next = sibling;
            }
            while (p.lastChild && this._isWhitespace(p.lastChild)) {
              p.removeChild(p.lastChild);
            }
            if (p.parentNode.tagName === "P")
              this._setNodeTag(p.parentNode, "DIV");
          }
        });
      },
      _setNodeTag: function(node, tag) {
        this.log("_setNodeTag", node, tag);
        if (this._docJSDOMParser) {
          node.localName = tag.toLowerCase();
          node.tagName = tag.toUpperCase();
          return node;
        }
        var replacement = node.ownerDocument.createElement(tag);
        while (node.firstChild) {
          replacement.appendChild(node.firstChild);
        }
        node.parentNode.replaceChild(replacement, node);
        if (node.readability)
          replacement.readability = node.readability;
        for (var i = 0; i < node.attributes.length; i++) {
          try {
            replacement.setAttribute(node.attributes[i].name, node.attributes[i].value);
          } catch (ex) {
          }
        }
        return replacement;
      },
      /**
       * Prepare the article node for display. Clean out any inline styles,
       * iframes, forms, strip extraneous <p> tags, etc.
       *
       * @param Element
       * @return void
       **/
      _prepArticle: function(articleContent) {
        this._cleanStyles(articleContent);
        this._markDataTables(articleContent);
        this._fixLazyImages(articleContent);
        this._cleanConditionally(articleContent, "form");
        this._cleanConditionally(articleContent, "fieldset");
        this._clean(articleContent, "object");
        this._clean(articleContent, "embed");
        this._clean(articleContent, "footer");
        this._clean(articleContent, "link");
        this._clean(articleContent, "aside");
        var shareElementThreshold = this.DEFAULT_CHAR_THRESHOLD;
        this._forEachNode(articleContent.children, function(topCandidate) {
          this._cleanMatchedNodes(topCandidate, function(node, matchString) {
            return this.REGEXPS.shareElements.test(matchString) && node.textContent.length < shareElementThreshold;
          });
        });
        this._clean(articleContent, "iframe");
        this._clean(articleContent, "input");
        this._clean(articleContent, "textarea");
        this._clean(articleContent, "select");
        this._clean(articleContent, "button");
        this._cleanHeaders(articleContent);
        this._cleanConditionally(articleContent, "table");
        this._cleanConditionally(articleContent, "ul");
        this._cleanConditionally(articleContent, "div");
        this._replaceNodeTags(this._getAllNodesWithTag(articleContent, ["h1"]), "h2");
        this._removeNodes(this._getAllNodesWithTag(articleContent, ["p"]), function(paragraph) {
          var imgCount = paragraph.getElementsByTagName("img").length;
          var embedCount = paragraph.getElementsByTagName("embed").length;
          var objectCount = paragraph.getElementsByTagName("object").length;
          var iframeCount = paragraph.getElementsByTagName("iframe").length;
          var totalCount = imgCount + embedCount + objectCount + iframeCount;
          return totalCount === 0 && !this._getInnerText(paragraph, false);
        });
        this._forEachNode(this._getAllNodesWithTag(articleContent, ["br"]), function(br) {
          var next = this._nextNode(br.nextSibling);
          if (next && next.tagName == "P")
            br.parentNode.removeChild(br);
        });
        this._forEachNode(this._getAllNodesWithTag(articleContent, ["table"]), function(table) {
          var tbody = this._hasSingleTagInsideElement(table, "TBODY") ? table.firstElementChild : table;
          if (this._hasSingleTagInsideElement(tbody, "TR")) {
            var row = tbody.firstElementChild;
            if (this._hasSingleTagInsideElement(row, "TD")) {
              var cell = row.firstElementChild;
              cell = this._setNodeTag(cell, this._everyNode(cell.childNodes, this._isPhrasingContent) ? "P" : "DIV");
              table.parentNode.replaceChild(cell, table);
            }
          }
        });
      },
      /**
       * Initialize a node with the readability object. Also checks the
       * className/id for special names to add to its score.
       *
       * @param Element
       * @return void
      **/
      _initializeNode: function(node) {
        node.readability = { "contentScore": 0 };
        switch (node.tagName) {
          case "DIV":
            node.readability.contentScore += 5;
            break;
          case "PRE":
          case "TD":
          case "BLOCKQUOTE":
            node.readability.contentScore += 3;
            break;
          case "ADDRESS":
          case "OL":
          case "UL":
          case "DL":
          case "DD":
          case "DT":
          case "LI":
          case "FORM":
            node.readability.contentScore -= 3;
            break;
          case "H1":
          case "H2":
          case "H3":
          case "H4":
          case "H5":
          case "H6":
          case "TH":
            node.readability.contentScore -= 5;
            break;
        }
        node.readability.contentScore += this._getClassWeight(node);
      },
      _removeAndGetNext: function(node) {
        var nextNode = this._getNextNode(node, true);
        node.parentNode.removeChild(node);
        return nextNode;
      },
      /**
       * Traverse the DOM from node to node, starting at the node passed in.
       * Pass true for the second parameter to indicate this node itself
       * (and its kids) are going away, and we want the next node over.
       *
       * Calling this in a loop will traverse the DOM depth-first.
       */
      _getNextNode: function(node, ignoreSelfAndKids) {
        if (!ignoreSelfAndKids && node.firstElementChild) {
          return node.firstElementChild;
        }
        if (node.nextElementSibling) {
          return node.nextElementSibling;
        }
        do {
          node = node.parentNode;
        } while (node && !node.nextElementSibling);
        return node && node.nextElementSibling;
      },
      // compares second text to first one
      // 1 = same text, 0 = completely different text
      // works the way that it splits both texts into words and then finds words that are unique in second text
      // the result is given by the lower length of unique parts
      _textSimilarity: function(textA, textB) {
        var tokensA = textA.toLowerCase().split(this.REGEXPS.tokenize).filter(Boolean);
        var tokensB = textB.toLowerCase().split(this.REGEXPS.tokenize).filter(Boolean);
        if (!tokensA.length || !tokensB.length) {
          return 0;
        }
        var uniqTokensB = tokensB.filter((token) => !tokensA.includes(token));
        var distanceB = uniqTokensB.join(" ").length / tokensB.join(" ").length;
        return 1 - distanceB;
      },
      _checkByline: function(node, matchString) {
        if (this._articleByline) {
          return false;
        }
        if (node.getAttribute !== void 0) {
          var rel = node.getAttribute("rel");
          var itemprop = node.getAttribute("itemprop");
        }
        if ((rel === "author" || itemprop && itemprop.indexOf("author") !== -1 || this.REGEXPS.byline.test(matchString)) && this._isValidByline(node.textContent)) {
          this._articleByline = node.textContent.trim();
          return true;
        }
        return false;
      },
      _getNodeAncestors: function(node, maxDepth) {
        maxDepth = maxDepth || 0;
        var i = 0, ancestors = [];
        while (node.parentNode) {
          ancestors.push(node.parentNode);
          if (maxDepth && ++i === maxDepth)
            break;
          node = node.parentNode;
        }
        return ancestors;
      },
      /***
       * grabArticle - Using a variety of metrics (content score, classname, element types), find the content that is
       *         most likely to be the stuff a user wants to read. Then return it wrapped up in a div.
       *
       * @param page a document to run upon. Needs to be a full document, complete with body.
       * @return Element
      **/
      _grabArticle: function(page) {
        this.log("**** grabArticle ****");
        var doc = this._doc;
        var isPaging = page !== null;
        page = page ? page : this._doc.body;
        if (!page) {
          this.log("No body found in document. Abort.");
          return null;
        }
        var pageCacheHtml = page.innerHTML;
        while (true) {
          this.log("Starting grabArticle loop");
          var stripUnlikelyCandidates = this._flagIsActive(this.FLAG_STRIP_UNLIKELYS);
          var elementsToScore = [];
          var node = this._doc.documentElement;
          let shouldRemoveTitleHeader = true;
          while (node) {
            if (node.tagName === "HTML") {
              this._articleLang = node.getAttribute("lang");
            }
            var matchString = node.className + " " + node.id;
            if (!this._isProbablyVisible(node)) {
              this.log("Removing hidden node - " + matchString);
              node = this._removeAndGetNext(node);
              continue;
            }
            if (node.getAttribute("aria-modal") == "true" && node.getAttribute("role") == "dialog") {
              node = this._removeAndGetNext(node);
              continue;
            }
            if (this._checkByline(node, matchString)) {
              node = this._removeAndGetNext(node);
              continue;
            }
            if (shouldRemoveTitleHeader && this._headerDuplicatesTitle(node)) {
              this.log("Removing header: ", node.textContent.trim(), this._articleTitle.trim());
              shouldRemoveTitleHeader = false;
              node = this._removeAndGetNext(node);
              continue;
            }
            if (stripUnlikelyCandidates) {
              if (this.REGEXPS.unlikelyCandidates.test(matchString) && !this.REGEXPS.okMaybeItsACandidate.test(matchString) && !this._hasAncestorTag(node, "table") && !this._hasAncestorTag(node, "code") && node.tagName !== "BODY" && node.tagName !== "A") {
                this.log("Removing unlikely candidate - " + matchString);
                node = this._removeAndGetNext(node);
                continue;
              }
              if (this.UNLIKELY_ROLES.includes(node.getAttribute("role"))) {
                this.log("Removing content with role " + node.getAttribute("role") + " - " + matchString);
                node = this._removeAndGetNext(node);
                continue;
              }
            }
            if ((node.tagName === "DIV" || node.tagName === "SECTION" || node.tagName === "HEADER" || node.tagName === "H1" || node.tagName === "H2" || node.tagName === "H3" || node.tagName === "H4" || node.tagName === "H5" || node.tagName === "H6") && this._isElementWithoutContent(node)) {
              node = this._removeAndGetNext(node);
              continue;
            }
            if (this.DEFAULT_TAGS_TO_SCORE.indexOf(node.tagName) !== -1) {
              elementsToScore.push(node);
            }
            if (node.tagName === "DIV") {
              var p = null;
              var childNode = node.firstChild;
              while (childNode) {
                var nextSibling = childNode.nextSibling;
                if (this._isPhrasingContent(childNode)) {
                  if (p !== null) {
                    p.appendChild(childNode);
                  } else if (!this._isWhitespace(childNode)) {
                    p = doc.createElement("p");
                    node.replaceChild(p, childNode);
                    p.appendChild(childNode);
                  }
                } else if (p !== null) {
                  while (p.lastChild && this._isWhitespace(p.lastChild)) {
                    p.removeChild(p.lastChild);
                  }
                  p = null;
                }
                childNode = nextSibling;
              }
              if (this._hasSingleTagInsideElement(node, "P") && this._getLinkDensity(node) < 0.25) {
                var newNode = node.children[0];
                node.parentNode.replaceChild(newNode, node);
                node = newNode;
                elementsToScore.push(node);
              } else if (!this._hasChildBlockElement(node)) {
                node = this._setNodeTag(node, "P");
                elementsToScore.push(node);
              }
            }
            node = this._getNextNode(node);
          }
          var candidates = [];
          this._forEachNode(elementsToScore, function(elementToScore) {
            if (!elementToScore.parentNode || typeof elementToScore.parentNode.tagName === "undefined")
              return;
            var innerText = this._getInnerText(elementToScore);
            if (innerText.length < 25)
              return;
            var ancestors2 = this._getNodeAncestors(elementToScore, 5);
            if (ancestors2.length === 0)
              return;
            var contentScore = 0;
            contentScore += 1;
            contentScore += innerText.split(this.REGEXPS.commas).length;
            contentScore += Math.min(Math.floor(innerText.length / 100), 3);
            this._forEachNode(ancestors2, function(ancestor, level) {
              if (!ancestor.tagName || !ancestor.parentNode || typeof ancestor.parentNode.tagName === "undefined")
                return;
              if (typeof ancestor.readability === "undefined") {
                this._initializeNode(ancestor);
                candidates.push(ancestor);
              }
              if (level === 0)
                var scoreDivider = 1;
              else if (level === 1)
                scoreDivider = 2;
              else
                scoreDivider = level * 3;
              ancestor.readability.contentScore += contentScore / scoreDivider;
            });
          });
          var topCandidates = [];
          for (var c = 0, cl = candidates.length; c < cl; c += 1) {
            var candidate = candidates[c];
            var candidateScore = candidate.readability.contentScore * (1 - this._getLinkDensity(candidate));
            candidate.readability.contentScore = candidateScore;
            this.log("Candidate:", candidate, "with score " + candidateScore);
            for (var t = 0; t < this._nbTopCandidates; t++) {
              var aTopCandidate = topCandidates[t];
              if (!aTopCandidate || candidateScore > aTopCandidate.readability.contentScore) {
                topCandidates.splice(t, 0, candidate);
                if (topCandidates.length > this._nbTopCandidates)
                  topCandidates.pop();
                break;
              }
            }
          }
          var topCandidate = topCandidates[0] || null;
          var neededToCreateTopCandidate = false;
          var parentOfTopCandidate;
          if (topCandidate === null || topCandidate.tagName === "BODY") {
            topCandidate = doc.createElement("DIV");
            neededToCreateTopCandidate = true;
            while (page.firstChild) {
              this.log("Moving child out:", page.firstChild);
              topCandidate.appendChild(page.firstChild);
            }
            page.appendChild(topCandidate);
            this._initializeNode(topCandidate);
          } else if (topCandidate) {
            var alternativeCandidateAncestors = [];
            for (var i = 1; i < topCandidates.length; i++) {
              if (topCandidates[i].readability.contentScore / topCandidate.readability.contentScore >= 0.75) {
                alternativeCandidateAncestors.push(this._getNodeAncestors(topCandidates[i]));
              }
            }
            var MINIMUM_TOPCANDIDATES = 3;
            if (alternativeCandidateAncestors.length >= MINIMUM_TOPCANDIDATES) {
              parentOfTopCandidate = topCandidate.parentNode;
              while (parentOfTopCandidate.tagName !== "BODY") {
                var listsContainingThisAncestor = 0;
                for (var ancestorIndex = 0; ancestorIndex < alternativeCandidateAncestors.length && listsContainingThisAncestor < MINIMUM_TOPCANDIDATES; ancestorIndex++) {
                  listsContainingThisAncestor += Number(alternativeCandidateAncestors[ancestorIndex].includes(parentOfTopCandidate));
                }
                if (listsContainingThisAncestor >= MINIMUM_TOPCANDIDATES) {
                  topCandidate = parentOfTopCandidate;
                  break;
                }
                parentOfTopCandidate = parentOfTopCandidate.parentNode;
              }
            }
            if (!topCandidate.readability) {
              this._initializeNode(topCandidate);
            }
            parentOfTopCandidate = topCandidate.parentNode;
            var lastScore = topCandidate.readability.contentScore;
            var scoreThreshold = lastScore / 3;
            while (parentOfTopCandidate.tagName !== "BODY") {
              if (!parentOfTopCandidate.readability) {
                parentOfTopCandidate = parentOfTopCandidate.parentNode;
                continue;
              }
              var parentScore = parentOfTopCandidate.readability.contentScore;
              if (parentScore < scoreThreshold)
                break;
              if (parentScore > lastScore) {
                topCandidate = parentOfTopCandidate;
                break;
              }
              lastScore = parentOfTopCandidate.readability.contentScore;
              parentOfTopCandidate = parentOfTopCandidate.parentNode;
            }
            parentOfTopCandidate = topCandidate.parentNode;
            while (parentOfTopCandidate.tagName != "BODY" && parentOfTopCandidate.children.length == 1) {
              topCandidate = parentOfTopCandidate;
              parentOfTopCandidate = topCandidate.parentNode;
            }
            if (!topCandidate.readability) {
              this._initializeNode(topCandidate);
            }
          }
          var articleContent = doc.createElement("DIV");
          if (isPaging)
            articleContent.id = "readability-content";
          var siblingScoreThreshold = Math.max(10, topCandidate.readability.contentScore * 0.2);
          parentOfTopCandidate = topCandidate.parentNode;
          var siblings = parentOfTopCandidate.children;
          for (var s = 0, sl = siblings.length; s < sl; s++) {
            var sibling = siblings[s];
            var append = false;
            this.log("Looking at sibling node:", sibling, sibling.readability ? "with score " + sibling.readability.contentScore : "");
            this.log("Sibling has score", sibling.readability ? sibling.readability.contentScore : "Unknown");
            if (sibling === topCandidate) {
              append = true;
            } else {
              var contentBonus = 0;
              if (sibling.className === topCandidate.className && topCandidate.className !== "")
                contentBonus += topCandidate.readability.contentScore * 0.2;
              if (sibling.readability && sibling.readability.contentScore + contentBonus >= siblingScoreThreshold) {
                append = true;
              } else if (sibling.nodeName === "P") {
                var linkDensity = this._getLinkDensity(sibling);
                var nodeContent = this._getInnerText(sibling);
                var nodeLength = nodeContent.length;
                if (nodeLength > 80 && linkDensity < 0.25) {
                  append = true;
                } else if (nodeLength < 80 && nodeLength > 0 && linkDensity === 0 && nodeContent.search(/\.( |$)/) !== -1) {
                  append = true;
                }
              }
            }
            if (append) {
              this.log("Appending node:", sibling);
              if (this.ALTER_TO_DIV_EXCEPTIONS.indexOf(sibling.nodeName) === -1) {
                this.log("Altering sibling:", sibling, "to div.");
                sibling = this._setNodeTag(sibling, "DIV");
              }
              articleContent.appendChild(sibling);
              siblings = parentOfTopCandidate.children;
              s -= 1;
              sl -= 1;
            }
          }
          if (this._debug)
            this.log("Article content pre-prep: " + articleContent.innerHTML);
          this._prepArticle(articleContent);
          if (this._debug)
            this.log("Article content post-prep: " + articleContent.innerHTML);
          if (neededToCreateTopCandidate) {
            topCandidate.id = "readability-page-1";
            topCandidate.className = "page";
          } else {
            var div = doc.createElement("DIV");
            div.id = "readability-page-1";
            div.className = "page";
            while (articleContent.firstChild) {
              div.appendChild(articleContent.firstChild);
            }
            articleContent.appendChild(div);
          }
          if (this._debug)
            this.log("Article content after paging: " + articleContent.innerHTML);
          var parseSuccessful = true;
          var textLength = this._getInnerText(articleContent, true).length;
          if (textLength < this._charThreshold) {
            parseSuccessful = false;
            page.innerHTML = pageCacheHtml;
            if (this._flagIsActive(this.FLAG_STRIP_UNLIKELYS)) {
              this._removeFlag(this.FLAG_STRIP_UNLIKELYS);
              this._attempts.push({ articleContent, textLength });
            } else if (this._flagIsActive(this.FLAG_WEIGHT_CLASSES)) {
              this._removeFlag(this.FLAG_WEIGHT_CLASSES);
              this._attempts.push({ articleContent, textLength });
            } else if (this._flagIsActive(this.FLAG_CLEAN_CONDITIONALLY)) {
              this._removeFlag(this.FLAG_CLEAN_CONDITIONALLY);
              this._attempts.push({ articleContent, textLength });
            } else {
              this._attempts.push({ articleContent, textLength });
              this._attempts.sort(function(a, b) {
                return b.textLength - a.textLength;
              });
              if (!this._attempts[0].textLength) {
                return null;
              }
              articleContent = this._attempts[0].articleContent;
              parseSuccessful = true;
            }
          }
          if (parseSuccessful) {
            var ancestors = [parentOfTopCandidate, topCandidate].concat(this._getNodeAncestors(parentOfTopCandidate));
            this._someNode(ancestors, function(ancestor) {
              if (!ancestor.tagName)
                return false;
              var articleDir = ancestor.getAttribute("dir");
              if (articleDir) {
                this._articleDir = articleDir;
                return true;
              }
              return false;
            });
            return articleContent;
          }
        }
      },
      /**
       * Check whether the input string could be a byline.
       * This verifies that the input is a string, and that the length
       * is less than 100 chars.
       *
       * @param possibleByline {string} - a string to check whether its a byline.
       * @return Boolean - whether the input string is a byline.
       */
      _isValidByline: function(byline) {
        if (typeof byline == "string" || byline instanceof String) {
          byline = byline.trim();
          return byline.length > 0 && byline.length < 100;
        }
        return false;
      },
      /**
       * Converts some of the common HTML entities in string to their corresponding characters.
       *
       * @param str {string} - a string to unescape.
       * @return string without HTML entity.
       */
      _unescapeHtmlEntities: function(str) {
        if (!str) {
          return str;
        }
        var htmlEscapeMap = this.HTML_ESCAPE_MAP;
        return str.replace(/&(quot|amp|apos|lt|gt);/g, function(_, tag) {
          return htmlEscapeMap[tag];
        }).replace(/&#(?:x([0-9a-z]{1,4})|([0-9]{1,4}));/gi, function(_, hex, numStr) {
          var num = parseInt(hex || numStr, hex ? 16 : 10);
          return String.fromCharCode(num);
        });
      },
      /**
       * Try to extract metadata from JSON-LD object.
       * For now, only Schema.org objects of type Article or its subtypes are supported.
       * @return Object with any metadata that could be extracted (possibly none)
       */
      _getJSONLD: function(doc) {
        var scripts = this._getAllNodesWithTag(doc, ["script"]);
        var metadata;
        this._forEachNode(scripts, function(jsonLdElement) {
          if (!metadata && jsonLdElement.getAttribute("type") === "application/ld+json") {
            try {
              var content = jsonLdElement.textContent.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "");
              var parsed = JSON.parse(content);
              if (!parsed["@context"] || !parsed["@context"].match(/^https?\:\/\/schema\.org$/)) {
                return;
              }
              if (!parsed["@type"] && Array.isArray(parsed["@graph"])) {
                parsed = parsed["@graph"].find(function(it) {
                  return (it["@type"] || "").match(
                    this.REGEXPS.jsonLdArticleTypes
                  );
                });
              }
              if (!parsed || !parsed["@type"] || !parsed["@type"].match(this.REGEXPS.jsonLdArticleTypes)) {
                return;
              }
              metadata = {};
              if (typeof parsed.name === "string" && typeof parsed.headline === "string" && parsed.name !== parsed.headline) {
                var title = this._getArticleTitle();
                var nameMatches = this._textSimilarity(parsed.name, title) > 0.75;
                var headlineMatches = this._textSimilarity(parsed.headline, title) > 0.75;
                if (headlineMatches && !nameMatches) {
                  metadata.title = parsed.headline;
                } else {
                  metadata.title = parsed.name;
                }
              } else if (typeof parsed.name === "string") {
                metadata.title = parsed.name.trim();
              } else if (typeof parsed.headline === "string") {
                metadata.title = parsed.headline.trim();
              }
              if (parsed.author) {
                if (typeof parsed.author.name === "string") {
                  metadata.byline = parsed.author.name.trim();
                } else if (Array.isArray(parsed.author) && parsed.author[0] && typeof parsed.author[0].name === "string") {
                  metadata.byline = parsed.author.filter(function(author) {
                    return author && typeof author.name === "string";
                  }).map(function(author) {
                    return author.name.trim();
                  }).join(", ");
                }
              }
              if (typeof parsed.description === "string") {
                metadata.excerpt = parsed.description.trim();
              }
              if (parsed.publisher && typeof parsed.publisher.name === "string") {
                metadata.siteName = parsed.publisher.name.trim();
              }
              if (typeof parsed.datePublished === "string") {
                metadata.datePublished = parsed.datePublished.trim();
              }
              return;
            } catch (err) {
              this.log(err.message);
            }
          }
        });
        return metadata ? metadata : {};
      },
      /**
       * Attempts to get excerpt and byline metadata for the article.
       *
       * @param {Object} jsonld — object containing any metadata that
       * could be extracted from JSON-LD object.
       *
       * @return Object with optional "excerpt" and "byline" properties
       */
      _getArticleMetadata: function(jsonld) {
        var metadata = {};
        var values = {};
        var metaElements = this._doc.getElementsByTagName("meta");
        var propertyPattern = /\s*(article|dc|dcterm|og|twitter)\s*:\s*(author|creator|description|published_time|title|site_name)\s*/gi;
        var namePattern = /^\s*(?:(dc|dcterm|og|twitter|weibo:(article|webpage))\s*[\.:]\s*)?(author|creator|description|title|site_name)\s*$/i;
        this._forEachNode(metaElements, function(element) {
          var elementName = element.getAttribute("name");
          var elementProperty = element.getAttribute("property");
          var content = element.getAttribute("content");
          if (!content) {
            return;
          }
          var matches = null;
          var name = null;
          if (elementProperty) {
            matches = elementProperty.match(propertyPattern);
            if (matches) {
              name = matches[0].toLowerCase().replace(/\s/g, "");
              values[name] = content.trim();
            }
          }
          if (!matches && elementName && namePattern.test(elementName)) {
            name = elementName;
            if (content) {
              name = name.toLowerCase().replace(/\s/g, "").replace(/\./g, ":");
              values[name] = content.trim();
            }
          }
        });
        metadata.title = jsonld.title || values["dc:title"] || values["dcterm:title"] || values["og:title"] || values["weibo:article:title"] || values["weibo:webpage:title"] || values["title"] || values["twitter:title"];
        if (!metadata.title) {
          metadata.title = this._getArticleTitle();
        }
        metadata.byline = jsonld.byline || values["dc:creator"] || values["dcterm:creator"] || values["author"];
        metadata.excerpt = jsonld.excerpt || values["dc:description"] || values["dcterm:description"] || values["og:description"] || values["weibo:article:description"] || values["weibo:webpage:description"] || values["description"] || values["twitter:description"];
        metadata.siteName = jsonld.siteName || values["og:site_name"];
        metadata.publishedTime = jsonld.datePublished || values["article:published_time"] || null;
        metadata.title = this._unescapeHtmlEntities(metadata.title);
        metadata.byline = this._unescapeHtmlEntities(metadata.byline);
        metadata.excerpt = this._unescapeHtmlEntities(metadata.excerpt);
        metadata.siteName = this._unescapeHtmlEntities(metadata.siteName);
        metadata.publishedTime = this._unescapeHtmlEntities(metadata.publishedTime);
        return metadata;
      },
      /**
       * Check if node is image, or if node contains exactly only one image
       * whether as a direct child or as its descendants.
       *
       * @param Element
      **/
      _isSingleImage: function(node) {
        if (node.tagName === "IMG") {
          return true;
        }
        if (node.children.length !== 1 || node.textContent.trim() !== "") {
          return false;
        }
        return this._isSingleImage(node.children[0]);
      },
      /**
       * Find all <noscript> that are located after <img> nodes, and which contain only one
       * <img> element. Replace the first image with the image from inside the <noscript> tag,
       * and remove the <noscript> tag. This improves the quality of the images we use on
       * some sites (e.g. Medium).
       *
       * @param Element
      **/
      _unwrapNoscriptImages: function(doc) {
        var imgs = Array.from(doc.getElementsByTagName("img"));
        this._forEachNode(imgs, function(img) {
          for (var i = 0; i < img.attributes.length; i++) {
            var attr = img.attributes[i];
            switch (attr.name) {
              case "src":
              case "srcset":
              case "data-src":
              case "data-srcset":
                return;
            }
            if (/\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
              return;
            }
          }
          img.parentNode.removeChild(img);
        });
        var noscripts = Array.from(doc.getElementsByTagName("noscript"));
        this._forEachNode(noscripts, function(noscript) {
          var tmp = doc.createElement("div");
          tmp.innerHTML = noscript.innerHTML;
          if (!this._isSingleImage(tmp)) {
            return;
          }
          var prevElement = noscript.previousElementSibling;
          if (prevElement && this._isSingleImage(prevElement)) {
            var prevImg = prevElement;
            if (prevImg.tagName !== "IMG") {
              prevImg = prevElement.getElementsByTagName("img")[0];
            }
            var newImg = tmp.getElementsByTagName("img")[0];
            for (var i = 0; i < prevImg.attributes.length; i++) {
              var attr = prevImg.attributes[i];
              if (attr.value === "") {
                continue;
              }
              if (attr.name === "src" || attr.name === "srcset" || /\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
                if (newImg.getAttribute(attr.name) === attr.value) {
                  continue;
                }
                var attrName = attr.name;
                if (newImg.hasAttribute(attrName)) {
                  attrName = "data-old-" + attrName;
                }
                newImg.setAttribute(attrName, attr.value);
              }
            }
            noscript.parentNode.replaceChild(tmp.firstElementChild, prevElement);
          }
        });
      },
      /**
       * Removes script tags from the document.
       *
       * @param Element
      **/
      _removeScripts: function(doc) {
        this._removeNodes(this._getAllNodesWithTag(doc, ["script", "noscript"]));
      },
      /**
       * Check if this node has only whitespace and a single element with given tag
       * Returns false if the DIV node contains non-empty text nodes
       * or if it contains no element with given tag or more than 1 element.
       *
       * @param Element
       * @param string tag of child element
      **/
      _hasSingleTagInsideElement: function(element, tag) {
        if (element.children.length != 1 || element.children[0].tagName !== tag) {
          return false;
        }
        return !this._someNode(element.childNodes, function(node) {
          return node.nodeType === this.TEXT_NODE && this.REGEXPS.hasContent.test(node.textContent);
        });
      },
      _isElementWithoutContent: function(node) {
        return node.nodeType === this.ELEMENT_NODE && node.textContent.trim().length == 0 && (node.children.length == 0 || node.children.length == node.getElementsByTagName("br").length + node.getElementsByTagName("hr").length);
      },
      /**
       * Determine whether element has any children block level elements.
       *
       * @param Element
       */
      _hasChildBlockElement: function(element) {
        return this._someNode(element.childNodes, function(node) {
          return this.DIV_TO_P_ELEMS.has(node.tagName) || this._hasChildBlockElement(node);
        });
      },
      /***
       * Determine if a node qualifies as phrasing content.
       * https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories#Phrasing_content
      **/
      _isPhrasingContent: function(node) {
        return node.nodeType === this.TEXT_NODE || this.PHRASING_ELEMS.indexOf(node.tagName) !== -1 || (node.tagName === "A" || node.tagName === "DEL" || node.tagName === "INS") && this._everyNode(node.childNodes, this._isPhrasingContent);
      },
      _isWhitespace: function(node) {
        return node.nodeType === this.TEXT_NODE && node.textContent.trim().length === 0 || node.nodeType === this.ELEMENT_NODE && node.tagName === "BR";
      },
      /**
       * Get the inner text of a node - cross browser compatibly.
       * This also strips out any excess whitespace to be found.
       *
       * @param Element
       * @param Boolean normalizeSpaces (default: true)
       * @return string
      **/
      _getInnerText: function(e, normalizeSpaces) {
        normalizeSpaces = typeof normalizeSpaces === "undefined" ? true : normalizeSpaces;
        var textContent = e.textContent.trim();
        if (normalizeSpaces) {
          return textContent.replace(this.REGEXPS.normalize, " ");
        }
        return textContent;
      },
      /**
       * Get the number of times a string s appears in the node e.
       *
       * @param Element
       * @param string - what to split on. Default is ","
       * @return number (integer)
      **/
      _getCharCount: function(e, s) {
        s = s || ",";
        return this._getInnerText(e).split(s).length - 1;
      },
      /**
       * Remove the style attribute on every e and under.
       * TODO: Test if getElementsByTagName(*) is faster.
       *
       * @param Element
       * @return void
      **/
      _cleanStyles: function(e) {
        if (!e || e.tagName.toLowerCase() === "svg")
          return;
        for (var i = 0; i < this.PRESENTATIONAL_ATTRIBUTES.length; i++) {
          e.removeAttribute(this.PRESENTATIONAL_ATTRIBUTES[i]);
        }
        if (this.DEPRECATED_SIZE_ATTRIBUTE_ELEMS.indexOf(e.tagName) !== -1) {
          e.removeAttribute("width");
          e.removeAttribute("height");
        }
        var cur = e.firstElementChild;
        while (cur !== null) {
          this._cleanStyles(cur);
          cur = cur.nextElementSibling;
        }
      },
      /**
       * Get the density of links as a percentage of the content
       * This is the amount of text that is inside a link divided by the total text in the node.
       *
       * @param Element
       * @return number (float)
      **/
      _getLinkDensity: function(element) {
        var textLength = this._getInnerText(element).length;
        if (textLength === 0)
          return 0;
        var linkLength = 0;
        this._forEachNode(element.getElementsByTagName("a"), function(linkNode) {
          var href = linkNode.getAttribute("href");
          var coefficient = href && this.REGEXPS.hashUrl.test(href) ? 0.3 : 1;
          linkLength += this._getInnerText(linkNode).length * coefficient;
        });
        return linkLength / textLength;
      },
      /**
       * Get an elements class/id weight. Uses regular expressions to tell if this
       * element looks good or bad.
       *
       * @param Element
       * @return number (Integer)
      **/
      _getClassWeight: function(e) {
        if (!this._flagIsActive(this.FLAG_WEIGHT_CLASSES))
          return 0;
        var weight = 0;
        if (typeof e.className === "string" && e.className !== "") {
          if (this.REGEXPS.negative.test(e.className))
            weight -= 25;
          if (this.REGEXPS.positive.test(e.className))
            weight += 25;
        }
        if (typeof e.id === "string" && e.id !== "") {
          if (this.REGEXPS.negative.test(e.id))
            weight -= 25;
          if (this.REGEXPS.positive.test(e.id))
            weight += 25;
        }
        return weight;
      },
      /**
       * Clean a node of all elements of type "tag".
       * (Unless it's a youtube/vimeo video. People love movies.)
       *
       * @param Element
       * @param string tag to clean
       * @return void
       **/
      _clean: function(e, tag) {
        var isEmbed = ["object", "embed", "iframe"].indexOf(tag) !== -1;
        this._removeNodes(this._getAllNodesWithTag(e, [tag]), function(element) {
          if (isEmbed) {
            for (var i = 0; i < element.attributes.length; i++) {
              if (this._allowedVideoRegex.test(element.attributes[i].value)) {
                return false;
              }
            }
            if (element.tagName === "object" && this._allowedVideoRegex.test(element.innerHTML)) {
              return false;
            }
          }
          return true;
        });
      },
      /**
       * Check if a given node has one of its ancestor tag name matching the
       * provided one.
       * @param  HTMLElement node
       * @param  String      tagName
       * @param  Number      maxDepth
       * @param  Function    filterFn a filter to invoke to determine whether this node 'counts'
       * @return Boolean
       */
      _hasAncestorTag: function(node, tagName, maxDepth, filterFn) {
        maxDepth = maxDepth || 3;
        tagName = tagName.toUpperCase();
        var depth = 0;
        while (node.parentNode) {
          if (maxDepth > 0 && depth > maxDepth)
            return false;
          if (node.parentNode.tagName === tagName && (!filterFn || filterFn(node.parentNode)))
            return true;
          node = node.parentNode;
          depth++;
        }
        return false;
      },
      /**
       * Return an object indicating how many rows and columns this table has.
       */
      _getRowAndColumnCount: function(table) {
        var rows = 0;
        var columns = 0;
        var trs = table.getElementsByTagName("tr");
        for (var i = 0; i < trs.length; i++) {
          var rowspan = trs[i].getAttribute("rowspan") || 0;
          if (rowspan) {
            rowspan = parseInt(rowspan, 10);
          }
          rows += rowspan || 1;
          var columnsInThisRow = 0;
          var cells = trs[i].getElementsByTagName("td");
          for (var j = 0; j < cells.length; j++) {
            var colspan = cells[j].getAttribute("colspan") || 0;
            if (colspan) {
              colspan = parseInt(colspan, 10);
            }
            columnsInThisRow += colspan || 1;
          }
          columns = Math.max(columns, columnsInThisRow);
        }
        return { rows, columns };
      },
      /**
       * Look for 'data' (as opposed to 'layout') tables, for which we use
       * similar checks as
       * https://searchfox.org/mozilla-central/rev/f82d5c549f046cb64ce5602bfd894b7ae807c8f8/accessible/generic/TableAccessible.cpp#19
       */
      _markDataTables: function(root) {
        var tables = root.getElementsByTagName("table");
        for (var i = 0; i < tables.length; i++) {
          var table = tables[i];
          var role = table.getAttribute("role");
          if (role == "presentation") {
            table._readabilityDataTable = false;
            continue;
          }
          var datatable = table.getAttribute("datatable");
          if (datatable == "0") {
            table._readabilityDataTable = false;
            continue;
          }
          var summary = table.getAttribute("summary");
          if (summary) {
            table._readabilityDataTable = true;
            continue;
          }
          var caption = table.getElementsByTagName("caption")[0];
          if (caption && caption.childNodes.length > 0) {
            table._readabilityDataTable = true;
            continue;
          }
          var dataTableDescendants = ["col", "colgroup", "tfoot", "thead", "th"];
          var descendantExists = function(tag) {
            return !!table.getElementsByTagName(tag)[0];
          };
          if (dataTableDescendants.some(descendantExists)) {
            this.log("Data table because found data-y descendant");
            table._readabilityDataTable = true;
            continue;
          }
          if (table.getElementsByTagName("table")[0]) {
            table._readabilityDataTable = false;
            continue;
          }
          var sizeInfo = this._getRowAndColumnCount(table);
          if (sizeInfo.rows >= 10 || sizeInfo.columns > 4) {
            table._readabilityDataTable = true;
            continue;
          }
          table._readabilityDataTable = sizeInfo.rows * sizeInfo.columns > 10;
        }
      },
      /* convert images and figures that have properties like data-src into images that can be loaded without JS */
      _fixLazyImages: function(root) {
        this._forEachNode(this._getAllNodesWithTag(root, ["img", "picture", "figure"]), function(elem) {
          if (elem.src && this.REGEXPS.b64DataUrl.test(elem.src)) {
            var parts = this.REGEXPS.b64DataUrl.exec(elem.src);
            if (parts[1] === "image/svg+xml") {
              return;
            }
            var srcCouldBeRemoved = false;
            for (var i = 0; i < elem.attributes.length; i++) {
              var attr = elem.attributes[i];
              if (attr.name === "src") {
                continue;
              }
              if (/\.(jpg|jpeg|png|webp)/i.test(attr.value)) {
                srcCouldBeRemoved = true;
                break;
              }
            }
            if (srcCouldBeRemoved) {
              var b64starts = elem.src.search(/base64\s*/i) + 7;
              var b64length = elem.src.length - b64starts;
              if (b64length < 133) {
                elem.removeAttribute("src");
              }
            }
          }
          if ((elem.src || elem.srcset && elem.srcset != "null") && elem.className.toLowerCase().indexOf("lazy") === -1) {
            return;
          }
          for (var j = 0; j < elem.attributes.length; j++) {
            attr = elem.attributes[j];
            if (attr.name === "src" || attr.name === "srcset" || attr.name === "alt") {
              continue;
            }
            var copyTo = null;
            if (/\.(jpg|jpeg|png|webp)\s+\d/.test(attr.value)) {
              copyTo = "srcset";
            } else if (/^\s*\S+\.(jpg|jpeg|png|webp)\S*\s*$/.test(attr.value)) {
              copyTo = "src";
            }
            if (copyTo) {
              if (elem.tagName === "IMG" || elem.tagName === "PICTURE") {
                elem.setAttribute(copyTo, attr.value);
              } else if (elem.tagName === "FIGURE" && !this._getAllNodesWithTag(elem, ["img", "picture"]).length) {
                var img = this._doc.createElement("img");
                img.setAttribute(copyTo, attr.value);
                elem.appendChild(img);
              }
            }
          }
        });
      },
      _getTextDensity: function(e, tags) {
        var textLength = this._getInnerText(e, true).length;
        if (textLength === 0) {
          return 0;
        }
        var childrenLength = 0;
        var children = this._getAllNodesWithTag(e, tags);
        this._forEachNode(children, (child) => childrenLength += this._getInnerText(child, true).length);
        return childrenLength / textLength;
      },
      /**
       * Clean an element of all tags of type "tag" if they look fishy.
       * "Fishy" is an algorithm based on content length, classnames, link density, number of images & embeds, etc.
       *
       * @return void
       **/
      _cleanConditionally: function(e, tag) {
        if (!this._flagIsActive(this.FLAG_CLEAN_CONDITIONALLY))
          return;
        this._removeNodes(this._getAllNodesWithTag(e, [tag]), function(node) {
          var isDataTable = function(t) {
            return t._readabilityDataTable;
          };
          var isList = tag === "ul" || tag === "ol";
          if (!isList) {
            var listLength = 0;
            var listNodes = this._getAllNodesWithTag(node, ["ul", "ol"]);
            this._forEachNode(listNodes, (list) => listLength += this._getInnerText(list).length);
            isList = listLength / this._getInnerText(node).length > 0.9;
          }
          if (tag === "table" && isDataTable(node)) {
            return false;
          }
          if (this._hasAncestorTag(node, "table", -1, isDataTable)) {
            return false;
          }
          if (this._hasAncestorTag(node, "code")) {
            return false;
          }
          var weight = this._getClassWeight(node);
          this.log("Cleaning Conditionally", node);
          var contentScore = 0;
          if (weight + contentScore < 0) {
            return true;
          }
          if (this._getCharCount(node, ",") < 10) {
            var p = node.getElementsByTagName("p").length;
            var img = node.getElementsByTagName("img").length;
            var li = node.getElementsByTagName("li").length - 100;
            var input = node.getElementsByTagName("input").length;
            var headingDensity = this._getTextDensity(node, ["h1", "h2", "h3", "h4", "h5", "h6"]);
            var embedCount = 0;
            var embeds = this._getAllNodesWithTag(node, ["object", "embed", "iframe"]);
            for (var i = 0; i < embeds.length; i++) {
              for (var j = 0; j < embeds[i].attributes.length; j++) {
                if (this._allowedVideoRegex.test(embeds[i].attributes[j].value)) {
                  return false;
                }
              }
              if (embeds[i].tagName === "object" && this._allowedVideoRegex.test(embeds[i].innerHTML)) {
                return false;
              }
              embedCount++;
            }
            var linkDensity = this._getLinkDensity(node);
            var contentLength = this._getInnerText(node).length;
            var haveToRemove = img > 1 && p / img < 0.5 && !this._hasAncestorTag(node, "figure") || !isList && li > p || input > Math.floor(p / 3) || !isList && headingDensity < 0.9 && contentLength < 25 && (img === 0 || img > 2) && !this._hasAncestorTag(node, "figure") || !isList && weight < 25 && linkDensity > 0.2 || weight >= 25 && linkDensity > 0.5 || (embedCount === 1 && contentLength < 75 || embedCount > 1);
            if (isList && haveToRemove) {
              for (var x = 0; x < node.children.length; x++) {
                let child = node.children[x];
                if (child.children.length > 1) {
                  return haveToRemove;
                }
              }
              let li_count = node.getElementsByTagName("li").length;
              if (img == li_count) {
                return false;
              }
            }
            return haveToRemove;
          }
          return false;
        });
      },
      /**
       * Clean out elements that match the specified conditions
       *
       * @param Element
       * @param Function determines whether a node should be removed
       * @return void
       **/
      _cleanMatchedNodes: function(e, filter) {
        var endOfSearchMarkerNode = this._getNextNode(e, true);
        var next = this._getNextNode(e);
        while (next && next != endOfSearchMarkerNode) {
          if (filter.call(this, next, next.className + " " + next.id)) {
            next = this._removeAndGetNext(next);
          } else {
            next = this._getNextNode(next);
          }
        }
      },
      /**
       * Clean out spurious headers from an Element.
       *
       * @param Element
       * @return void
      **/
      _cleanHeaders: function(e) {
        let headingNodes = this._getAllNodesWithTag(e, ["h1", "h2"]);
        this._removeNodes(headingNodes, function(node) {
          let shouldRemove = this._getClassWeight(node) < 0;
          if (shouldRemove) {
            this.log("Removing header with low class weight:", node);
          }
          return shouldRemove;
        });
      },
      /**
       * Check if this node is an H1 or H2 element whose content is mostly
       * the same as the article title.
       *
       * @param Element  the node to check.
       * @return boolean indicating whether this is a title-like header.
       */
      _headerDuplicatesTitle: function(node) {
        if (node.tagName != "H1" && node.tagName != "H2") {
          return false;
        }
        var heading = this._getInnerText(node, false);
        this.log("Evaluating similarity of header:", heading, this._articleTitle);
        return this._textSimilarity(this._articleTitle, heading) > 0.75;
      },
      _flagIsActive: function(flag) {
        return (this._flags & flag) > 0;
      },
      _removeFlag: function(flag) {
        this._flags = this._flags & ~flag;
      },
      _isProbablyVisible: function(node) {
        return (!node.style || node.style.display != "none") && (!node.style || node.style.visibility != "hidden") && !node.hasAttribute("hidden") && (!node.hasAttribute("aria-hidden") || node.getAttribute("aria-hidden") != "true" || node.className && node.className.indexOf && node.className.indexOf("fallback-image") !== -1);
      },
      /**
       * Runs readability.
       *
       * Workflow:
       *  1. Prep the document by removing script tags, css, etc.
       *  2. Build readability's DOM tree.
       *  3. Grab the article content from the current dom tree.
       *  4. Replace the current DOM tree with the new one.
       *  5. Read peacefully.
       *
       * @return void
       **/
      parse: function() {
        if (this._maxElemsToParse > 0) {
          var numTags = this._doc.getElementsByTagName("*").length;
          if (numTags > this._maxElemsToParse) {
            throw new Error("Aborting parsing document; " + numTags + " elements found");
          }
        }
        this._unwrapNoscriptImages(this._doc);
        var jsonLd = this._disableJSONLD ? {} : this._getJSONLD(this._doc);
        this._removeScripts(this._doc);
        this._prepDocument();
        var metadata = this._getArticleMetadata(jsonLd);
        this._articleTitle = metadata.title;
        var articleContent = this._grabArticle();
        if (!articleContent)
          return null;
        this.log("Grabbed: " + articleContent.innerHTML);
        this._postProcessContent(articleContent);
        if (!metadata.excerpt) {
          var paragraphs = articleContent.getElementsByTagName("p");
          if (paragraphs.length > 0) {
            metadata.excerpt = paragraphs[0].textContent.trim();
          }
        }
        var textContent = articleContent.textContent;
        return {
          title: this._articleTitle,
          byline: metadata.byline || this._articleByline,
          dir: this._articleDir,
          lang: this._articleLang,
          content: this._serializer(articleContent),
          textContent,
          length: textContent.length,
          excerpt: metadata.excerpt,
          siteName: metadata.siteName || this._articleSiteName,
          publishedTime: metadata.publishedTime
        };
      }
    };
    {
      module.exports = Readability2;
    }
  })(Readability$1);
  var ReadabilityExports = Readability$1.exports;
  var ReadabilityReaderable = { exports: {} };
  (function(module) {
    var REGEXPS = {
      // NOTE: These two regular expressions are duplicated in
      // Readability.js. Please keep both copies in sync.
      unlikelyCandidates: /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
      okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i
    };
    function isNodeVisible(node) {
      return (!node.style || node.style.display != "none") && !node.hasAttribute("hidden") && (!node.hasAttribute("aria-hidden") || node.getAttribute("aria-hidden") != "true" || node.className && node.className.indexOf && node.className.indexOf("fallback-image") !== -1);
    }
    function isProbablyReaderable(doc, options = {}) {
      if (typeof options == "function") {
        options = { visibilityChecker: options };
      }
      var defaultOptions = { minScore: 20, minContentLength: 140, visibilityChecker: isNodeVisible };
      options = Object.assign(defaultOptions, options);
      var nodes = doc.querySelectorAll("p, pre, article");
      var brNodes = doc.querySelectorAll("div > br");
      if (brNodes.length) {
        var set = new Set(nodes);
        [].forEach.call(brNodes, function(node) {
          set.add(node.parentNode);
        });
        nodes = Array.from(set);
      }
      var score = 0;
      return [].some.call(nodes, function(node) {
        if (!options.visibilityChecker(node)) {
          return false;
        }
        var matchString = node.className + " " + node.id;
        if (REGEXPS.unlikelyCandidates.test(matchString) && !REGEXPS.okMaybeItsACandidate.test(matchString)) {
          return false;
        }
        if (node.matches("li p")) {
          return false;
        }
        var textContentLength = node.textContent.trim().length;
        if (textContentLength < options.minContentLength) {
          return false;
        }
        score += Math.sqrt(textContentLength - options.minContentLength);
        if (score > options.minScore) {
          return true;
        }
        return false;
      });
    }
    {
      module.exports = isProbablyReaderable;
    }
  })(ReadabilityReaderable);
  var Readability = ReadabilityExports;
  var readability = {
    Readability
  };
  const NOVEL_CONTENT_SELECTORS = [
    "#chaptercontent",
    "#content",
    "#htmlContent",
    "#BookText",
    "#txtContent",
    ".content",
    ".read-content",
    ".entry-content",
    "#novelcontent",
    "#chapter-content",
    ".chapter-content"
  ];
  const NEXT_CHAPTER_REGEX = /^(?:下一[章页]|下页|下一话)$|下一章|下一页|下页/;
  const NOISE_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "NAV",
    "HEADER",
    "FOOTER",
    "ASIDE",
    "IFRAME",
    "FORM",
    "SVG"
  ]);
  const MIN_CONTENT_CHAR_THRESHOLD = 30;
  function cleanLine(raw) {
    return raw.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\u00A0\u3000]/g, " ").replace(/[ \t\f\r]+/g, " ").trim();
  }
  function cleanTitle(raw) {
    const line = cleanLine(raw);
    return line.replace(/[-_|(][^-_|(]*?(?:小说|网|阁|看书|中文|免费|书院|首发|章节).*$/i, "").replace(/\s*[-_|]\s*[^- _|]+$/, "").trim() || line;
  }
  function cleanParagraphs(rawText) {
    return rawText.split(/\r?\n+/).map(cleanLine).filter((line) => line.length > 0);
  }
  function countEffectiveChars(paragraphs) {
    return paragraphs.reduce((sum, p) => sum + p.replace(/\s+/g, "").length, 0);
  }
  function extractParagraphsFromElement(element) {
    const clone = element.cloneNode(true);
    const noiseElements = clone.querySelectorAll(
      "script, style, noscript, nav, header, footer, aside, iframe, form"
    );
    noiseElements.forEach((el) => el.remove());
    const brs = clone.querySelectorAll("br");
    brs.forEach((br) => {
      br.replaceWith(clone.ownerDocument.createTextNode("\n"));
    });
    const ps = clone.querySelectorAll("p");
    ps.forEach((p) => {
      p.prepend(clone.ownerDocument.createTextNode("\n"));
      p.append(clone.ownerDocument.createTextNode("\n"));
    });
    const text = clone.textContent || "";
    return cleanParagraphs(text);
  }
  function findFallbackContentElement(doc) {
    var _a;
    for (const selector of NOVEL_CONTENT_SELECTORS) {
      const el = doc.querySelector(selector);
      if (el) {
        const text = ((_a = el.textContent) == null ? void 0 : _a.trim()) || "";
        if (text.length >= MIN_CONTENT_CHAR_THRESHOLD) {
          return el;
        }
      }
    }
    const candidates = doc.querySelectorAll("article, section, div");
    let bestElement = null;
    let maxTextLength = 0;
    candidates.forEach((cand) => {
      var _a2;
      if (NOISE_TAGS.has(cand.tagName)) return;
      if (cand.querySelector("form, input, button") && !cand.querySelector("p, br")) {
        return;
      }
      const directTextLength = ((_a2 = cand.textContent) == null ? void 0 : _a2.replace(/\s+/g, "").length) || 0;
      if (directTextLength > maxTextLength) {
        const innerBlocks = cand.querySelectorAll("article, section");
        if (innerBlocks.length === 0) {
          maxTextLength = directTextLength;
          bestElement = cand;
        }
      }
    });
    if (maxTextLength >= MIN_CONTENT_CHAR_THRESHOLD) {
      return bestElement;
    }
    return null;
  }
  function extractFallbackTitle(doc) {
    var _a, _b;
    const h1 = doc.querySelector("h1");
    if (h1 && ((_a = h1.textContent) == null ? void 0 : _a.trim())) {
      return cleanTitle(h1.textContent);
    }
    const titleEl = doc.querySelector(".title, .chapter-title, #title, #chaptername");
    if (titleEl && ((_b = titleEl.textContent) == null ? void 0 : _b.trim())) {
      return cleanTitle(titleEl.textContent);
    }
    if (doc.title) {
      return cleanTitle(doc.title);
    }
    return "";
  }
  function extractNextChapterUrl(doc, currentUrl) {
    const baseUrl = currentUrl || doc.baseURI || "http://localhost";
    let currentParsed = null;
    try {
      currentParsed = new URL(baseUrl);
    } catch {
    }
    const links = Array.from(doc.querySelectorAll("a"));
    let matchedHref = null;
    for (let i = links.length - 1; i >= 0; i--) {
      const link = links[i];
      const text = cleanLine(link.textContent || "");
      const title = cleanLine(link.getAttribute("title") || "");
      if ((NEXT_CHAPTER_REGEX.test(text) || NEXT_CHAPTER_REGEX.test(title)) && !text.includes("上一") && !title.includes("上一")) {
        const rawHref = link.getAttribute("href");
        if (rawHref && rawHref.trim() && !rawHref.startsWith("javascript:") && rawHref !== "#") {
          matchedHref = rawHref.trim();
          break;
        }
      }
    }
    if (!matchedHref) {
      return null;
    }
    try {
      const absolute = new URL(matchedHref, baseUrl);
      if (!["http:", "https:"].includes(absolute.protocol)) {
        return null;
      }
      if (currentParsed) {
        const currentNoHash = `${currentParsed.origin}${currentParsed.pathname}${currentParsed.search}`;
        const targetNoHash = `${absolute.origin}${absolute.pathname}${absolute.search}`;
        if (currentNoHash === targetNoHash) {
          return null;
        }
      }
      return absolute.href;
    } catch {
      return null;
    }
  }
  function extractChapterContent(doc, currentUrl) {
    const nextChapterUrl = extractNextChapterUrl(doc, currentUrl);
    let title = "";
    let paragraphs = [];
    try {
      const clonedDoc = doc.cloneNode(true);
      const reader = new readability.Readability(clonedDoc, {
        charThreshold: 20
      });
      const parsed = reader.parse();
      if (parsed && parsed.textContent) {
        paragraphs = cleanParagraphs(parsed.textContent);
        title = cleanTitle(parsed.title || "");
      }
    } catch {
      paragraphs = [];
    }
    const effectiveChars = countEffectiveChars(paragraphs);
    if (paragraphs.length === 0 || effectiveChars < 100) {
      const fallbackEl = findFallbackContentElement(doc);
      if (fallbackEl) {
        const fallbackParagraphs = extractParagraphsFromElement(fallbackEl);
        if (fallbackParagraphs.length > 0) {
          paragraphs = fallbackParagraphs;
        }
      } else if (effectiveChars < MIN_CONTENT_CHAR_THRESHOLD) {
        paragraphs = [];
      }
      const fallbackTitle = extractFallbackTitle(doc);
      if (!title || title.length > 50 || title.includes("-") || title.includes("_")) {
        title = fallbackTitle || title;
      }
    }
    title = cleanTitle(title || extractFallbackTitle(doc));
    if (paragraphs.length > 0 && title && paragraphs[0] === title) {
      paragraphs.shift();
    }
    if (countEffectiveChars(paragraphs) < MIN_CONTENT_CHAR_THRESHOLD) {
      paragraphs = [];
    }
    return {
      title,
      paragraphs,
      nextChapterUrl
    };
  }
  class WebSpeechEngine {
    constructor() {
      __publicField(this, "currentUtterance", null);
    }
    isSupported() {
      return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
    }
    speak(text, options, callbacks) {
      var _a, _b;
      if (!this.isSupported()) {
        (_a = callbacks == null ? void 0 : callbacks.onError) == null ? void 0 : _a.call(callbacks, new Error("Web Speech Synthesis is not supported in this browser"));
        return;
      }
      try {
        this.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utterance;
        utterance.rate = Math.max(0.5, Math.min(2.5, options.rate || 1.2));
        utterance.lang = "zh-CN";
        utterance.onstart = () => {
          var _a2;
          (_a2 = callbacks == null ? void 0 : callbacks.onStart) == null ? void 0 : _a2.call(callbacks);
        };
        utterance.onend = () => {
          var _a2;
          if (this.currentUtterance === utterance) {
            this.currentUtterance = null;
          }
          (_a2 = callbacks == null ? void 0 : callbacks.onEnd) == null ? void 0 : _a2.call(callbacks);
        };
        utterance.onerror = (event) => {
          var _a2;
          if (event.error === "canceled" || event.error === "interrupted") {
            return;
          }
          if (this.currentUtterance === utterance) {
            this.currentUtterance = null;
          }
          (_a2 = callbacks == null ? void 0 : callbacks.onError) == null ? void 0 : _a2.call(callbacks, new Error(`SpeechSynthesis error: ${event.error}`));
        };
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        (_b = callbacks == null ? void 0 : callbacks.onError) == null ? void 0 : _b.call(callbacks, err instanceof Error ? err : new Error(String(err)));
      }
    }
    pause() {
      if (this.isSupported() && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
      }
    }
    resume() {
      if (this.isSupported() && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
    cancel() {
      if (this.isSupported()) {
        window.speechSynthesis.cancel();
        this.currentUtterance = null;
      }
    }
  }
  const DEFAULT_MIN_CHARS = 30;
  const DEFAULT_MAX_CHARS = 120;
  const PRIMARY_DELIMITER_REGEX = /([^\r\n。！？；!?]+(?:[。！？；!?]+[”’"'\)）》]*|$))/g;
  const SECONDARY_DELIMITER_REGEX = /([^\r\n，,、：:——……]+(?:[，,、：:——……]+[”’"'\)）》]*|$))/g;
  function isPunctuationOrWhitespaceOnly(str) {
    return !/[\p{L}\p{N}]/u.test(str);
  }
  function hardSlice(text, chunkSize) {
    const slices = [];
    let index = 0;
    while (index < text.length) {
      slices.push(text.slice(index, index + chunkSize));
      index += chunkSize;
    }
    return slices;
  }
  function splitOverlongSentence(sentence, maxChars) {
    if (sentence.length <= maxChars) {
      return [sentence];
    }
    const matches = sentence.match(SECONDARY_DELIMITER_REGEX);
    if (!matches || matches.length <= 1) {
      return hardSlice(sentence, maxChars);
    }
    const results = [];
    let current = "";
    for (const part of matches) {
      if (!part) continue;
      if (part.length > maxChars) {
        if (current) {
          results.push(current);
          current = "";
        }
        results.push(...hardSlice(part, maxChars));
      } else if (current.length + part.length <= maxChars) {
        current += part;
      } else {
        if (current) results.push(current);
        current = part;
      }
    }
    if (current) {
      results.push(current);
    }
    return results;
  }
  function chunkText(input, options) {
    const minChars = DEFAULT_MIN_CHARS;
    const maxChars = DEFAULT_MAX_CHARS;
    const rawText = Array.isArray(input) ? input.join("\n") : input;
    if (!rawText || !rawText.trim()) {
      return [];
    }
    const rawSegments = rawText.match(PRIMARY_DELIMITER_REGEX) || [rawText];
    const atomicSentences = [];
    for (const seg of rawSegments) {
      const trimmed = seg.trim();
      if (!trimmed || isPunctuationOrWhitespaceOnly(trimmed)) {
        continue;
      }
      if (trimmed.length > maxChars) {
        const pieces = splitOverlongSentence(trimmed, maxChars);
        for (const piece of pieces) {
          const pTrimmed = piece.trim();
          if (pTrimmed && !isPunctuationOrWhitespaceOnly(pTrimmed)) {
            atomicSentences.push(pTrimmed);
          }
        }
      } else {
        atomicSentences.push(trimmed);
      }
    }
    if (atomicSentences.length === 0) {
      return [];
    }
    const mergedChunks = [];
    let buffer = "";
    for (const sentence of atomicSentences) {
      if (!buffer) {
        buffer = sentence;
        continue;
      }
      if (buffer.length < minChars && buffer.length + sentence.length <= maxChars) {
        buffer += sentence;
      } else {
        mergedChunks.push(buffer);
        buffer = sentence;
      }
    }
    if (buffer) {
      if (buffer.length < minChars && mergedChunks.length > 0 && mergedChunks[mergedChunks.length - 1].length + buffer.length <= maxChars) {
        mergedChunks[mergedChunks.length - 1] += buffer;
      } else {
        mergedChunks.push(buffer);
      }
    }
    return mergedChunks.filter((chunk) => !isPunctuationOrWhitespaceOnly(chunk));
  }
  const MAX_CACHE_SIZE = 3;
  const SILENT_AUDIO_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  class NovelPlayer {
    constructor(config) {
      __publicField(this, "state", "idle");
      __publicField(this, "provider");
      __publicField(this, "webSpeechEngine");
      __publicField(this, "isUsingFallback", false);
      // 单例音频实例
      __publicField(this, "audio");
      __publicField(this, "isAudioUnlocked", false);
      // 章节与句子队列
      __publicField(this, "currentChapter", null);
      __publicField(this, "sentences", []);
      __publicField(this, "currentIndex", 0);
      // 预取缓存池 (最多 3 条)
      __publicField(this, "prefetchCache", /* @__PURE__ */ new Map());
      // 播放配置
      __publicField(this, "voice");
      __publicField(this, "rate");
      // 容错与重试计数
      __publicField(this, "consecutiveFailures", 0);
      // 事件回调
      __publicField(this, "events");
      // Wake Lock
      __publicField(this, "wakeLockSentinel", null);
      this.provider = config.provider;
      this.voice = config.voice || "zh-CN-XiaoxiaoNeural";
      this.rate = config.rate || 1.2;
      this.events = config.events || {};
      this.webSpeechEngine = new WebSpeechEngine();
      this.audio = typeof Audio !== "undefined" ? new Audio() : {};
      this.setupAudioListeners();
      this.setupMediaSession();
    }
    // ─── 状态机管理 ────────────────────────────────────────────────────────
    getState() {
      return this.state;
    }
    getCurrentIndex() {
      return this.currentIndex;
    }
    getSentences() {
      return this.sentences;
    }
    isFallbackMode() {
      return this.isUsingFallback;
    }
    setEvents(events) {
      this.events = { ...this.events, ...events };
    }
    setProvider(provider) {
      this.provider = provider;
      this.isUsingFallback = false;
      this.consecutiveFailures = 0;
      this.clearPrefetchCache();
    }
    setState(newState) {
      var _a, _b;
      if (this.state === newState) return;
      this.state = newState;
      (_b = (_a = this.events).onStateChange) == null ? void 0 : _b.call(_a, newState);
      this.updateMediaSessionState();
    }
    // ─── 音频事件与解锁 ──────────────────────────────────────────────────
    setupAudioListeners() {
      if (!this.audio || typeof this.audio.addEventListener !== "function") return;
      this.audio.addEventListener("ended", () => {
        this.handleSentenceEnd();
      });
      this.audio.addEventListener("error", () => {
        if (this.state === "playing") {
          this.handlePlaybackFailure(new Error("Audio playback error"));
        }
      });
    }
    /**
     * 用户手势同步调用栈内解锁单例 Audio
     */
    unlockAudio() {
      if (this.isAudioUnlocked || !this.audio || typeof this.audio.play !== "function") return;
      try {
        this.audio.src = SILENT_AUDIO_WAV;
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(() => {
            this.isAudioUnlocked = true;
          }).catch(() => {
          });
        } else {
          this.isAudioUnlocked = true;
        }
      } catch {
      }
    }
    // ─── 后台保活：Media Session 与 Wake Lock ────────────────────────────
    setupMediaSession() {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      const session = navigator.mediaSession;
      try {
        session.setActionHandler("play", () => this.resume());
        session.setActionHandler("pause", () => this.pause());
        session.setActionHandler("previoustrack", () => this.previousSentence());
        session.setActionHandler("nexttrack", () => this.nextSentence());
      } catch {
      }
    }
    updateMediaSessionMetadata() {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !this.currentChapter) {
        return;
      }
      const currentText = this.sentences[this.currentIndex] || "";
      const progress = `(${this.currentIndex + 1}/${this.sentences.length})`;
      try {
        if (typeof MediaMetadata !== "undefined") {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `${this.currentChapter.title} ${progress}`,
            artist: "NovelTTS 朗读器",
            album: currentText.slice(0, 30)
          });
        }
      } catch {
      }
    }
    updateMediaSessionState() {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      try {
        if (this.state === "playing") {
          navigator.mediaSession.playbackState = "playing";
        } else if (this.state === "paused") {
          navigator.mediaSession.playbackState = "paused";
        } else {
          navigator.mediaSession.playbackState = "none";
        }
      } catch {
      }
    }
    async requestWakeLock() {
      if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
      try {
        if (!this.wakeLockSentinel) {
          this.wakeLockSentinel = await navigator.wakeLock.request("screen");
        }
      } catch {
      }
    }
    releaseWakeLock() {
      if (this.wakeLockSentinel) {
        try {
          this.wakeLockSentinel.release();
        } catch {
        }
        this.wakeLockSentinel = null;
      }
    }
    // ─── 预取队列与内存管理 ───────────────────────────────────────────────
    /**
     * 彻底清空并释放所有预取缓存中的 Blob URL 及正在进行的请求
     */
    clearPrefetchCache() {
      this.prefetchCache.forEach((item) => {
        try {
          item.abortController.abort();
        } catch {
        }
        if (item.blobUrl) {
          try {
            URL.revokeObjectURL(item.blobUrl);
          } catch {
          }
        }
      });
      this.prefetchCache.clear();
    }
    /**
     * 释放单条已播放完毕或无用的缓存
     */
    revokeCacheItem(index) {
      const item = this.prefetchCache.get(index);
      if (!item) return;
      try {
        item.abortController.abort();
      } catch {
      }
      if (item.blobUrl) {
        try {
          URL.revokeObjectURL(item.blobUrl);
        } catch {
        }
      }
      this.prefetchCache.delete(index);
    }
    /**
     * 触发预取下一个与下下个句子 (N+1, N+2)
     */
    triggerPrefetch() {
      if (this.isUsingFallback) return;
      const next1 = this.currentIndex + 1;
      const next2 = this.currentIndex + 2;
      if (next1 < this.sentences.length) {
        this.fetchSentenceBlob(next1);
      }
      if (next2 < this.sentences.length) {
        this.fetchSentenceBlob(next2);
      }
      this.prefetchCache.forEach((_, key) => {
        if (key < this.currentIndex || key > this.currentIndex + 2) {
          this.revokeCacheItem(key);
        }
      });
    }
    /**
     * 获取或并发请求指定句子的音频 Blob URL
     */
    async fetchSentenceBlob(index) {
      if (index >= this.sentences.length) {
        throw new Error(`Sentence index out of range: ${index}`);
      }
      const cached = this.prefetchCache.get(index);
      if (cached) {
        if (cached.blobUrl) return cached.blobUrl;
        if (cached.promise) return cached.promise;
      }
      if (this.prefetchCache.size >= MAX_CACHE_SIZE) {
        const keys = Array.from(this.prefetchCache.keys());
        const furthestKey = keys.reduce(
          (max, curr) => Math.abs(curr - this.currentIndex) > Math.abs(max - this.currentIndex) ? curr : max
        );
        this.revokeCacheItem(furthestKey);
      }
      const abortController = new AbortController();
      const text = this.sentences[index];
      const options = {
        voice: this.voice,
        rate: this.rate,
        signal: abortController.signal
      };
      const promise = (async () => {
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (abortController.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          try {
            const blobUrl = await this.provider.synthesize(text, options);
            const item = this.prefetchCache.get(index);
            if (item) {
              item.blobUrl = blobUrl;
            }
            return blobUrl;
          } catch (err) {
            if (err.name === "AbortError") throw err;
            lastError = err instanceof Error ? err : new Error(String(err));
          }
        }
        throw lastError || new Error(`Failed to synthesize sentence ${index}`);
      })();
      this.prefetchCache.set(index, {
        abortController,
        promise
      });
      return promise;
    }
    // ─── 核心播放逻辑 ─────────────────────────────────────────────────────
    /**
     * 载入章节并开始播放
     */
    async playChapter(chapter, startIndex = 0) {
      var _a, _b;
      this.unlockAudio();
      this.stop();
      this.currentChapter = chapter;
      this.sentences = chunkText(chapter.paragraphs);
      if (this.sentences.length === 0) {
        (_b = (_a = this.events).onToast) == null ? void 0 : _b.call(_a, "未识别到小说正文，无法播放");
        this.setState("idle");
        return;
      }
      this.currentIndex = Math.max(0, Math.min(startIndex, this.sentences.length - 1));
      await this.playCurrentSentence();
    }
    /**
     * 播放当前索引所指向的句子
     */
    async playCurrentSentence() {
      var _a, _b;
      if (this.currentIndex >= this.sentences.length) {
        this.handleChapterEnd();
        return;
      }
      this.setState("loading");
      this.updateMediaSessionMetadata();
      (_b = (_a = this.events).onIndexChange) == null ? void 0 : _b.call(
        _a,
        this.currentIndex,
        this.sentences.length,
        this.sentences[this.currentIndex]
      );
      if (this.isUsingFallback) {
        this.playViaWebSpeech(this.sentences[this.currentIndex]);
        return;
      }
      try {
        const blobUrl = await this.fetchSentenceBlob(this.currentIndex);
        if (this.state !== "loading") {
          return;
        }
        this.audio.src = blobUrl;
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          await playPromise;
        }
        this.setState("playing");
        this.consecutiveFailures = 0;
        await this.requestWakeLock();
        this.triggerPrefetch();
      } catch (err) {
        if (err.name === "AbortError") return;
        await this.handlePlaybackFailure(err);
      }
    }
    /**
     * 单句播放失败与自动降级处理
     */
    async handlePlaybackFailure(error) {
      var _a, _b, _c, _d;
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2) {
        this.isUsingFallback = true;
        this.clearPrefetchCache();
        (_b = (_a = this.events).onToast) == null ? void 0 : _b.call(_a, "Edge TTS 连接异常，已自动切换为系统语音朗读");
        this.playViaWebSpeech(this.sentences[this.currentIndex]);
        return;
      }
      (_d = (_c = this.events).onError) == null ? void 0 : _d.call(_c, error);
      setTimeout(() => {
        if (this.state === "loading" || this.state === "playing") {
          this.playCurrentSentence();
        }
      }, 500);
    }
    /**
     * 通过 WebSpeech 进行兜底朗读
     */
    playViaWebSpeech(text) {
      this.setState("playing");
      this.requestWakeLock();
      this.webSpeechEngine.speak(
        text,
        { voice: this.voice, rate: this.rate },
        {
          onStart: () => {
            this.setState("playing");
          },
          onEnd: () => {
            this.handleSentenceEnd();
          },
          onError: (err) => {
            var _a, _b;
            (_b = (_a = this.events).onError) == null ? void 0 : _b.call(_a, err);
            this.handleSentenceEnd();
          }
        }
      );
    }
    /**
     * 句子播放完毕的回调
     */
    handleSentenceEnd() {
      if (this.state !== "playing") return;
      this.revokeCacheItem(this.currentIndex);
      this.currentIndex++;
      if (this.currentIndex >= this.sentences.length) {
        this.handleChapterEnd();
      } else {
        this.playCurrentSentence();
      }
    }
    /**
     * 本章全部播放完成
     */
    handleChapterEnd() {
      var _a, _b;
      this.stop();
      (_b = (_a = this.events).onChapterEnd) == null ? void 0 : _b.call(_a);
    }
    // ─── 用户控制方法 ─────────────────────────────────────────────────────
    pause() {
      if (this.state !== "playing" && this.state !== "loading") return;
      if (this.isUsingFallback) {
        this.webSpeechEngine.pause();
      } else if (this.audio && typeof this.audio.pause === "function") {
        this.audio.pause();
      }
      this.releaseWakeLock();
      this.setState("paused");
    }
    resume() {
      if (this.state !== "paused") return;
      this.setState("playing");
      this.requestWakeLock();
      if (this.isUsingFallback) {
        this.webSpeechEngine.resume();
      } else if (this.audio && typeof this.audio.play === "function") {
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.catch(() => {
            this.playCurrentSentence();
          });
        }
      }
    }
    stop() {
      if (this.isUsingFallback) {
        this.webSpeechEngine.cancel();
      } else if (this.audio) {
        try {
          if (typeof this.audio.pause === "function") this.audio.pause();
          this.audio.src = "";
        } catch {
        }
      }
      this.releaseWakeLock();
      this.clearPrefetchCache();
      this.setState("idle");
    }
    nextSentence() {
      if (this.sentences.length === 0) return;
      this.unlockAudio();
      if (this.currentIndex < this.sentences.length - 1) {
        this.revokeCacheItem(this.currentIndex);
        this.currentIndex++;
        this.playCurrentSentence();
      } else {
        this.handleChapterEnd();
      }
    }
    previousSentence() {
      if (this.sentences.length === 0) return;
      this.unlockAudio();
      if (this.currentIndex > 0) {
        this.revokeCacheItem(this.currentIndex);
        this.currentIndex--;
        this.playCurrentSentence();
      } else {
        this.playCurrentSentence();
      }
    }
    seek(index) {
      if (this.sentences.length === 0) return;
      this.unlockAudio();
      const target = Math.max(0, Math.min(index, this.sentences.length - 1));
      this.clearPrefetchCache();
      this.currentIndex = target;
      this.playCurrentSentence();
    }
    setRate(rate) {
      this.rate = rate;
      this.clearPrefetchCache();
      if (this.state === "playing") {
        if (this.isUsingFallback) {
          this.playCurrentSentence();
        } else {
          this.audio.playbackRate = rate;
          this.triggerPrefetch();
        }
      }
    }
    setVoice(voice) {
      this.voice = voice;
      this.clearPrefetchCache();
      if (this.state === "playing") {
        this.playCurrentSentence();
      }
    }
  }
  const DEFAULT_CONFIG = {
    workerUrl: "",
    token: "",
    voice: "zh-CN-XiaoxiaoNeural",
    rate: 1.2
  };
  const STORAGE_KEY = "novel_tts_config";
  class ConfigStorage {
    static isGMSupported() {
      return typeof GM_getValue === "function" && typeof GM_setValue === "function";
    }
    static load() {
      try {
        if (this.isGMSupported()) {
          const raw = GM_getValue(STORAGE_KEY, null);
          if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_CONFIG, ...parsed };
          }
        } else if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_CONFIG, ...parsed };
          }
        }
      } catch {
      }
      return { ...DEFAULT_CONFIG };
    }
    static save(patch) {
      const current = this.load();
      const updated = { ...current, ...patch };
      try {
        const serialized = JSON.stringify(updated);
        if (this.isGMSupported()) {
          GM_setValue(STORAGE_KEY, serialized);
        } else if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, serialized);
        }
      } catch (err) {
        console.warn("[NovelTTS] Failed to persist config:", err);
      }
      return updated;
    }
  }
  function detectCharset(headers, buffer) {
    let headerCharset = "";
    if (typeof headers === "string") {
      const match = headers.match(/charset=([a-zA-Z0-9_-]+)/i);
      if (match) headerCharset = match[1].toLowerCase();
    } else if (headers && typeof headers === "object") {
      const contentType = headers["content-type"] || headers["Content-Type"] || headers["content-type".toLowerCase()] || "";
      const match = contentType.match(/charset=([a-zA-Z0-9_-]+)/i);
      if (match) headerCharset = match[1].toLowerCase();
    }
    if (headerCharset) {
      return normalizeEncoding(headerCharset);
    }
    try {
      const peekLen = Math.min(buffer.byteLength, 2048);
      const peekBytes = new Uint8Array(buffer, 0, peekLen);
      let asciiHeader = "";
      for (let i = 0; i < peekLen; i++) {
        asciiHeader += String.fromCharCode(peekBytes[i]);
      }
      const metaMatch = asciiHeader.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i) || asciiHeader.match(/<meta[^>]+content=["'][^"']*?charset=([a-zA-Z0-9_-]+)/i);
      if (metaMatch) {
        return normalizeEncoding(metaMatch[1].toLowerCase());
      }
    } catch {
    }
    return "utf-8";
  }
  function normalizeEncoding(enc) {
    if (["gbk", "gb2312", "gb18030"].includes(enc)) {
      return "gb18030";
    }
    if (["utf-8", "utf8"].includes(enc)) {
      return "utf-8";
    }
    return enc;
  }
  class ChapterLoader {
    constructor(initialUrl) {
      __publicField(this, "visitedUrls", /* @__PURE__ */ new Set());
      if (initialUrl) {
        this.markVisited(initialUrl);
      }
    }
    markVisited(url) {
      const norm = this.normalizeUrl(url);
      if (norm) {
        this.visitedUrls.add(norm);
      }
    }
    hasVisited(url) {
      const norm = this.normalizeUrl(url);
      if (!norm) return false;
      return this.visitedUrls.has(norm);
    }
    resetVisited(currentUrl) {
      this.visitedUrls.clear();
      if (currentUrl) {
        this.markVisited(currentUrl);
      }
    }
    getVisitedUrls() {
      return new Set(this.visitedUrls);
    }
    normalizeUrl(rawUrl) {
      try {
        const u = new URL(rawUrl);
        if (!["http:", "https:"].includes(u.protocol)) {
          return null;
        }
        return `${u.origin}${u.pathname}${u.search}`;
      } catch {
        return null;
      }
    }
    /**
     * 静默拉取指定章节的 HTML 并解析正文
     * @param targetUrl 下一章完整 URL
     */
    async loadChapter(targetUrl) {
      const normalized = this.normalizeUrl(targetUrl);
      if (!normalized) {
        console.warn("[NovelTTS] Invalid chapter URL:", targetUrl);
        return null;
      }
      if (this.visitedUrls.has(normalized)) {
        console.warn("[NovelTTS] Prevented loop: already visited URL:", normalized);
        return null;
      }
      const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
      if (!gmRequest) {
        throw new Error("GM_xmlhttpRequest is not available for chapter loading");
      }
      const html = await new Promise((resolve, reject) => {
        gmRequest({
          method: "GET",
          url: targetUrl,
          responseType: "arraybuffer",
          timeout: 1e4,
          onload: (resp) => {
            if (resp.status < 200 || resp.status >= 300) {
              reject(new Error(`Failed to fetch chapter, HTTP ${resp.status}`));
              return;
            }
            const buffer = resp.response;
            if (!buffer || buffer.byteLength === 0) {
              reject(new Error("Received empty response for chapter"));
              return;
            }
            const charset = detectCharset(resp.responseHeaders || "", buffer);
            try {
              const decoder = new TextDecoder(charset);
              const decoded = decoder.decode(buffer);
              resolve(decoded);
            } catch (decodeErr) {
              const fallbackDecoder = new TextDecoder("utf-8");
              resolve(fallbackDecoder.decode(buffer));
            }
          },
          onerror: (err) => reject(new Error(`Network error loading chapter: ${JSON.stringify(err)}`)),
          ontimeout: () => reject(new Error("Timed out loading next chapter"))
        });
      });
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const content = extractChapterContent(doc, targetUrl);
      this.visitedUrls.add(normalized);
      return content;
    }
  }
  class EdgeWorkerTTSProvider {
    constructor(options) {
      __publicField(this, "name", "edge-worker");
      __publicField(this, "workerUrl");
      __publicField(this, "token");
      __publicField(this, "timeoutMs");
      this.workerUrl = this.sanitizeUrl(options.workerUrl);
      this.token = options.token;
      this.timeoutMs = options.timeoutMs ?? 8e3;
    }
    sanitizeUrl(url) {
      return url.trim().replace(/\/+$/, "").replace(/\/tts\/?$/i, "");
    }
    updateConfig(workerUrl, token) {
      if (workerUrl !== void 0) {
        this.workerUrl = this.sanitizeUrl(workerUrl);
      }
      if (token !== void 0) {
        this.token = token;
      }
    }
    async synthesize(text, options) {
      var _a;
      if (!text || !text.trim()) {
        throw new Error("TTS synthesis failed: text cannot be empty");
      }
      if ((_a = options.signal) == null ? void 0 : _a.aborted) {
        throw new DOMException("The synthesis request was aborted", "AbortError");
      }
      const queryParams = new URLSearchParams({
        text: text.trim(),
        voice: options.voice || "zh-CN-XiaoxiaoNeural",
        rate: String(options.rate || 1.2),
        token: this.token
      });
      const targetUrl = `${this.workerUrl}/tts?${queryParams.toString()}`;
      const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
      if (!gmRequest) {
        throw new Error("GM_xmlhttpRequest is not available in the current environment");
      }
      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanupSignal = () => {
          if (options.signal) {
            options.signal.removeEventListener("abort", onAbort);
          }
        };
        const finishError = (err) => {
          if (settled) return;
          settled = true;
          cleanupSignal();
          reject(err);
        };
        const finishSuccess = (blobUrl) => {
          if (settled) return;
          settled = true;
          cleanupSignal();
          resolve(blobUrl);
        };
        let requestHandle = null;
        const onAbort = () => {
          try {
            if (requestHandle && typeof requestHandle.abort === "function") {
              requestHandle.abort();
            }
          } catch {
          }
          finishError(new DOMException("The synthesis request was aborted", "AbortError"));
        };
        if (options.signal) {
          options.signal.addEventListener("abort", onAbort);
        }
        try {
          requestHandle = gmRequest({
            method: "GET",
            url: targetUrl,
            responseType: "blob",
            timeout: this.timeoutMs,
            onload: (response) => {
              if (response.status < 200 || response.status >= 300) {
                finishError(
                  new Error(
                    `Edge Worker HTTP ${response.status}: ${response.statusText || "Request failed"}`
                  )
                );
                return;
              }
              const blob = response.response;
              if (!blob || blob.size === 0) {
                finishError(new Error("Edge Worker returned an empty audio response"));
                return;
              }
              try {
                const blobUrl = URL.createObjectURL(blob);
                finishSuccess(blobUrl);
              } catch (createErr) {
                finishError(new Error(`Failed to create Object URL: ${createErr}`));
              }
            },
            onerror: (err) => {
              finishError(new Error(`Network error requesting Edge Worker: ${JSON.stringify(err)}`));
            },
            ontimeout: () => {
              finishError(new Error(`Edge Worker request timed out after ${this.timeoutMs}ms`));
            }
          });
        } catch (invokeErr) {
          finishError(new Error(`Failed to invoke GM_xmlhttpRequest: ${invokeErr}`));
        }
      });
    }
  }
  class FloatingBar {
    constructor(config, events) {
      __publicField(this, "host");
      __publicField(this, "shadow");
      __publicField(this, "events");
      // 状态引用
      __publicField(this, "isExpanded", false);
      __publicField(this, "isSettingsOpen", false);
      __publicField(this, "playerState", "idle");
      __publicField(this, "currentProgress", { index: 0, total: 0, text: "" });
      __publicField(this, "currentChapterTitle", "小说听书");
      __publicField(this, "currentChapterUrl", null);
      __publicField(this, "currentRate", 1.2);
      __publicField(this, "currentVoice", "zh-CN-XiaoxiaoNeural");
      // DOM 元素引用
      __publicField(this, "ballEl");
      __publicField(this, "panelEl");
      __publicField(this, "playBtn");
      __publicField(this, "titleEl");
      __publicField(this, "progressEl");
      __publicField(this, "textEl");
      __publicField(this, "rateBtn");
      __publicField(this, "voiceSelect");
      __publicField(this, "toastEl");
      __publicField(this, "settingsDrawer");
      __publicField(this, "workerInput");
      __publicField(this, "tokenInput");
      __publicField(this, "jumpChapterBtn");
      __publicField(this, "toastTimer", null);
      this.events = events;
      this.currentRate = config.rate;
      this.currentVoice = config.voice;
      this.host = document.createElement("div");
      this.host.id = "novel-tts-floating-root";
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.render(config);
      this.bindEvents();
    }
    mount(parent = document.body) {
      if (!parent.contains(this.host)) {
        parent.appendChild(this.host);
      }
    }
    unmount() {
      if (this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
    }
    toggleVisible() {
      if (this.host.style.display === "none") {
        this.host.style.display = "block";
      } else {
        this.host.style.display = "none";
      }
    }
    // ─── 状态更新接口 ──────────────────────────────────────────────────────
    updatePlayerState(state) {
      this.playerState = state;
      this.updatePlayButton();
      this.updateBallAnimation();
    }
    updateProgress(index, total, sentence) {
      this.currentProgress = { index, total, text: sentence };
      this.progressEl.textContent = `${index + 1} / ${total}`;
      this.textEl.textContent = sentence || "正在准备朗读…";
    }
    updateChapter(title, nextUrl, currentUrl) {
      this.currentChapterTitle = title;
      this.titleEl.textContent = title;
      if (currentUrl) {
        this.currentChapterUrl = currentUrl;
        this.jumpChapterBtn.style.display = "inline-block";
      } else {
        this.jumpChapterBtn.style.display = "none";
      }
    }
    showToast(message, duration = 3e3) {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
      this.toastEl.textContent = message;
      this.toastEl.classList.add("visible");
      this.toastTimer = setTimeout(() => {
        this.toastEl.classList.remove("visible");
      }, duration);
    }
    // ─── DOM 渲染 ─────────────────────────────────────────────────────────
    render(config) {
      const style = document.createElement("style");
      style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: #f1f5f9;
        -webkit-tap-highlight-color: transparent;
        z-index: 2147483647;
      }

      /* 悬浮小球 (折叠态) */
      .ball {
        position: fixed;
        bottom: 70px;
        right: 18px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: rgba(30, 41, 59, 0.88);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
        z-index: 100;
      }
      .ball:active {
        transform: scale(0.92);
      }
      .ball-icon {
        width: 22px;
        height: 22px;
        fill: #38bdf8;
      }
      .ball.playing {
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.6), 0 0 0 1px rgba(56, 189, 248, 0.4);
        animation: pulse 2.4s infinite ease-in-out;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }

      /* 展开态面板 (底部磨砂控制台) */
      .panel {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.4);
        padding: 14px 16px env(safe-area-inset-bottom, 14px);
        box-sizing: border-box;
        transform: translateY(105%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 101;
      }
      .panel.open {
        transform: translateY(0);
      }

      /* 头部信息区 */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .title-box {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
      }
      .title {
        font-weight: 600;
        font-size: 15px;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 220px;
      }
      .jump-btn {
        display: none;
        font-size: 11px;
        padding: 2px 6px;
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
        border-radius: 4px;
        text-decoration: none;
        cursor: pointer;
      }
      .actions-box {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .icon-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover, .icon-btn:active {
        color: #f8fafc;
      }
      .progress-badge {
        font-size: 11px;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 7px;
        border-radius: 10px;
        color: #94a3b8;
      }

      /* 当前朗读句预览 */
      .sentence-preview {
        font-size: 13px;
        color: #cbd5e1;
        min-height: 36px;
        max-height: 36px;
        margin-bottom: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        background: rgba(255, 255, 255, 0.04);
        padding: 6px 10px;
        border-radius: 6px;
      }

      /* 控制按钮主行 */
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-around;
        margin-bottom: 12px;
      }
      .ctrl-btn {
        background: rgba(255, 255, 255, 0.08);
        border: none;
        border-radius: 50%;
        color: #f8fafc;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, transform 0.1s;
      }
      .ctrl-btn:active {
        transform: scale(0.9);
      }
      .ctrl-btn.secondary {
        width: 42px;
        height: 42px;
      }
      .ctrl-btn.primary {
        width: 54px;
        height: 54px;
        background: #0284c7;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
      }
      .ctrl-btn.primary:active {
        background: #0369a1;
      }
      .ctrl-btn svg {
        fill: currentColor;
      }

      /* 快捷设置行 */
      .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .rate-pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 500;
        padding: 5px 12px;
        border-radius: 14px;
        cursor: pointer;
      }
      .voice-select {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 8px;
        outline: none;
        max-width: 140px;
      }
      .voice-select option {
        background: #1e293b;
        color: #f8fafc;
      }

      /* 抽屉设置面板 */
      .settings-drawer {
        display: none;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .settings-drawer.open {
        display: block;
      }
      .field {
        margin-bottom: 8px;
      }
      .field label {
        display: block;
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 4px;
      }
      .field input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        padding: 6px 10px;
        color: #f8fafc;
        font-size: 12px;
        outline: none;
      }
      .save-btn {
        width: 100%;
        background: #0284c7;
        color: #ffffff;
        border: none;
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        margin-top: 4px;
      }
      .save-btn:active {
        background: #0369a1;
      }

      /* 提示 Toast */
      .toast {
        position: fixed;
        bottom: 230px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        background: rgba(15, 23, 42, 0.95);
        color: #f8fafc;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s, transform 0.25s;
        z-index: 102;
        max-width: 80%;
        text-align: center;
      }
      .toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
      const container = document.createElement("div");
      container.innerHTML = `
      <!-- 折叠小球 -->
      <div class="ball" id="tts-ball" title="展开小说听书面板">
        <svg class="ball-icon" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>

      <!-- 展开主面板 -->
      <div class="panel" id="tts-panel">
        <div class="header">
          <div class="title-box">
            <span class="title" id="tts-title">小说听书</span>
            <span class="jump-btn" id="tts-jump">查看原文</span>
          </div>
          <div class="actions-box">
            <span class="progress-badge" id="tts-progress">0 / 0</span>
            <button class="icon-btn" id="tts-gear" title="配置 Worker">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </button>
            <button class="icon-btn" id="tts-close" title="收起面板">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="sentence-preview" id="tts-sentence">点击播放开始听书…</div>

        <!-- 主控区 -->
        <div class="controls">
          <button class="ctrl-btn secondary" id="tts-prev" title="上一句">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="ctrl-btn primary" id="tts-play" title="播放/暂停">
            <svg width="26" height="26" viewBox="0 0 24 24" id="tts-play-icon">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button class="ctrl-btn secondary" id="tts-next" title="下一句">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button class="ctrl-btn secondary" id="tts-next-chapter" title="下一章">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
          </button>
        </div>

        <!-- 快捷参数区 -->
        <div class="settings-row">
          <button class="rate-pill" id="tts-rate">${config.rate.toFixed(1)}x</button>
          <select class="voice-select" id="tts-voice">
            <option value="zh-CN-XiaoxiaoNeural">晓晓 (女声·标准)</option>
            <option value="zh-CN-YunxiNeural">云希 (男声·生动)</option>
            <option value="zh-CN-YunjianNeural">云健 (男声·沉稳)</option>
            <option value="zh-CN-XiaoyiNeural">晓伊 (女声·灵动)</option>
          </select>
        </div>

        <!-- 设置抽屉 -->
        <div class="settings-drawer" id="tts-drawer">
          <div class="field">
            <label>Edge TTS Worker 地址 (URL)</label>
            <input type="text" id="tts-worker-url" placeholder="http://localhost:8787 或 CF Worker 域名" value="${config.workerUrl}"/>
          </div>
          <div class="field">
            <label>Worker 鉴权密钥 (Token)</label>
            <input type="text" id="tts-token" placeholder="dev-secret" value="${config.token}"/>
          </div>
          <button class="save-btn" id="tts-save-config">保存配置</button>
        </div>
      </div>

      <!-- Toast 消息 -->
      <div class="toast" id="tts-toast"></div>
    `;
      this.shadow.appendChild(style);
      this.shadow.appendChild(container);
      this.ballEl = this.shadow.querySelector("#tts-ball");
      this.panelEl = this.shadow.querySelector("#tts-panel");
      this.playBtn = this.shadow.querySelector("#tts-play");
      this.titleEl = this.shadow.querySelector("#tts-title");
      this.progressEl = this.shadow.querySelector("#tts-progress");
      this.textEl = this.shadow.querySelector("#tts-sentence");
      this.rateBtn = this.shadow.querySelector("#tts-rate");
      this.voiceSelect = this.shadow.querySelector("#tts-voice");
      this.toastEl = this.shadow.querySelector("#tts-toast");
      this.settingsDrawer = this.shadow.querySelector("#tts-drawer");
      this.workerInput = this.shadow.querySelector("#tts-worker-url");
      this.tokenInput = this.shadow.querySelector("#tts-token");
      this.jumpChapterBtn = this.shadow.querySelector("#tts-jump");
      this.voiceSelect.value = config.voice;
    }
    // ─── 事件绑定 ─────────────────────────────────────────────────────────
    bindEvents() {
      this.ballEl.addEventListener("click", () => {
        this.expandPanel();
      });
      this.shadow.querySelector("#tts-close").addEventListener("click", () => {
        this.collapsePanel();
      });
      this.playBtn.addEventListener("click", () => {
        this.events.onPlayToggle();
      });
      this.shadow.querySelector("#tts-prev").addEventListener("click", () => {
        this.events.onPrevSentence();
      });
      this.shadow.querySelector("#tts-next").addEventListener("click", () => {
        this.events.onNextSentence();
      });
      this.shadow.querySelector("#tts-next-chapter").addEventListener("click", () => {
        this.events.onNextChapter();
      });
      const rates = [1, 1.2, 1.5, 2];
      this.rateBtn.addEventListener("click", () => {
        const idx = rates.findIndex((r) => Math.abs(r - this.currentRate) < 0.05);
        const nextIdx = (idx + 1) % rates.length;
        this.currentRate = rates[nextIdx];
        this.rateBtn.textContent = `${this.currentRate.toFixed(1)}x`;
        this.events.onRateChange(this.currentRate);
        this.showToast(`语速已切换为 ${this.currentRate.toFixed(1)}x`);
      });
      this.voiceSelect.addEventListener("change", () => {
        this.currentVoice = this.voiceSelect.value;
        this.events.onVoiceChange(this.currentVoice);
        this.showToast("音色已更新");
      });
      this.shadow.querySelector("#tts-gear").addEventListener("click", () => {
        this.isSettingsOpen = !this.isSettingsOpen;
        this.settingsDrawer.classList.toggle("open", this.isSettingsOpen);
      });
      this.shadow.querySelector("#tts-save-config").addEventListener("click", () => {
        const url = this.workerInput.value.trim();
        const token = this.tokenInput.value.trim();
        this.events.onSaveConfig(url, token);
        this.isSettingsOpen = false;
        this.settingsDrawer.classList.remove("open");
        this.showToast("配置已保存");
      });
      this.jumpChapterBtn.addEventListener("click", () => {
        if (this.currentChapterUrl) {
          if (this.events.onJumpChapterUrl) {
            this.events.onJumpChapterUrl(this.currentChapterUrl);
          } else {
            window.location.href = this.currentChapterUrl;
          }
        }
      });
    }
    expandPanel() {
      this.isExpanded = true;
      this.panelEl.classList.add("open");
      this.ballEl.style.display = "none";
    }
    collapsePanel() {
      this.isExpanded = false;
      this.panelEl.classList.remove("open");
      this.ballEl.style.display = "flex";
    }
    updatePlayButton() {
      const icon = this.shadow.querySelector("#tts-play-icon");
      if (this.playerState === "playing") {
        icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        this.playBtn.title = "暂停";
      } else if (this.playerState === "loading") {
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        this.playBtn.title = "加载中…";
      } else {
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        this.playBtn.title = "播放";
      }
    }
    updateBallAnimation() {
      if (this.playerState === "playing") {
        this.ballEl.classList.add("playing");
      } else {
        this.ballEl.classList.remove("playing");
      }
    }
  }
  function initNovelTTS() {
    if (typeof window !== "undefined" && window.self !== window.top) {
      return;
    }
    const config = ConfigStorage.load();
    const workerProvider = new EdgeWorkerTTSProvider({
      workerUrl: config.workerUrl || "http://localhost:8787",
      token: config.token || "dev-secret"
    });
    const chapterLoader = new ChapterLoader(window.location.href);
    let currentChapter = null;
    let nextChapterUrl = null;
    const player = new NovelPlayer({
      provider: workerProvider,
      voice: config.voice,
      rate: config.rate,
      events: {
        onStateChange: (state) => {
          bar.updatePlayerState(state);
        },
        onIndexChange: (idx, total, text) => {
          bar.updateProgress(idx, total, text);
        },
        onToast: (msg) => {
          bar.showToast(msg);
        },
        onChapterEnd: () => {
          handleAutoNextChapter();
        }
      }
    });
    const handleAutoNextChapter = async () => {
      if (!nextChapterUrl) {
        bar.showToast("已播放至最后一章");
        return;
      }
      bar.showToast("正在加载下一章…");
      try {
        const targetUrl = nextChapterUrl;
        const loaded = await chapterLoader.loadChapter(targetUrl);
        if (!loaded || loaded.paragraphs.length === 0) {
          bar.showToast("下一章正文提取失败或已到达全书末尾");
          return;
        }
        currentChapter = loaded;
        nextChapterUrl = loaded.nextChapterUrl;
        bar.updateChapter(loaded.title, loaded.nextChapterUrl, targetUrl);
        bar.showToast(`已开始播放：${loaded.title}`);
        try {
          window.history.replaceState(null, "", targetUrl);
          document.title = loaded.title;
        } catch {
        }
        await player.playChapter(loaded);
      } catch (err) {
        console.error("[NovelTTS] Failed to auto advance chapter:", err);
        bar.showToast(`下一章加载失败: ${err.message || err}`);
      }
    };
    const bar = new FloatingBar(config, {
      onPlayToggle: async () => {
        const state = player.getState();
        if (state === "playing") {
          player.pause();
          return;
        }
        if (state === "paused") {
          player.resume();
          return;
        }
        if (!currentChapter) {
          bar.showToast("正在解析小说正文…");
          const extracted = extractChapterContent(document, window.location.href);
          if (!extracted || extracted.paragraphs.length === 0) {
            bar.showToast("未识别到小说正文，无法播放");
            return;
          }
          currentChapter = extracted;
          nextChapterUrl = extracted.nextChapterUrl;
          chapterLoader.markVisited(window.location.href);
          bar.updateChapter(extracted.title, extracted.nextChapterUrl);
        }
        if (!config.workerUrl) {
          bar.showToast("未配置 Worker，将自动使用系统语音试听（可点右上角齿轮配置）");
        }
        await player.playChapter(currentChapter);
      },
      onNextSentence: () => {
        player.nextSentence();
      },
      onPrevSentence: () => {
        player.previousSentence();
      },
      onNextChapter: () => {
        handleAutoNextChapter();
      },
      onRateChange: (rate) => {
        player.setRate(rate);
        ConfigStorage.save({ rate });
      },
      onVoiceChange: (voice) => {
        player.setVoice(voice);
        ConfigStorage.save({ voice });
      },
      onSaveConfig: (workerUrl, token) => {
        ConfigStorage.save({ workerUrl, token });
        workerProvider.updateConfig(workerUrl, token);
        player.setProvider(workerProvider);
        bar.showToast("配置已保存并生效");
      },
      onJumpChapterUrl: (url) => {
        window.location.href = url;
      }
    });
    const mountUI = () => {
      bar.mount(document.body);
    };
    if (document.body) {
      mountUI();
    } else {
      window.addEventListener("DOMContentLoaded", mountUI);
    }
    if (typeof GM_registerMenuCommand === "function") {
      try {
        GM_registerMenuCommand("显示/隐藏听书悬浮球", () => {
          bar.toggleVisible();
        });
      } catch {
      }
    }
  }
  initNovelTTS();

})();