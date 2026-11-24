// ==UserScript==
// @name         NovelTTS-Userscript
// @namespace    https://github.com/John-S-hall/ForIris
// @version      0.3.0
// @author       John-S-hall
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
  const NEXT_CHAPTER_EXCLUDE_REGEX = /(?:上一|上章|上页|目录|书架|书签|推荐|预告|催更|评论|投票)/;
  const NEXT_CHAPTER_TIER1_REGEX = /^(?:下一[章节回话]|下章|后一章|nextchapter)[→>»›]*$/i;
  const NEXT_CHAPTER_TIER2_REGEX = /^(?:下一页|下页|nextpage|next)[→>»›]*$/i;
  const NEXT_CHAPTER_TIER3_REGEX = /(?:下一章|下一页|下页|下一节|下章)/;
  const PREV_CHAPTER_EXCLUDE_REGEX = /(?:下一|下章|下页|目录|书架|书签|推荐|预告|催更|评论|投票)/;
  const PREV_CHAPTER_TIER1_REGEX = /^(?:上一[章节回话]|上章|前一章|prevchapter|previouschapter)[←<«‹]*$/i;
  const PREV_CHAPTER_TIER2_REGEX = /^(?:上一页|上页|prevpage|prev|previous)[←<«‹]*$/i;
  const PREV_CHAPTER_TIER3_REGEX = /(?:上一章|上一页|上页|上一节|上章)/;
  const NEXT_CHAPTER_RULE = {
    rel: "next",
    knownSelector: "#pb_next, #next_url, #pt_next, #nextchapter, #linkNext, a.next-chapter",
    excludeRegex: NEXT_CHAPTER_EXCLUDE_REGEX,
    tier1Regex: NEXT_CHAPTER_TIER1_REGEX,
    tier2Regex: NEXT_CHAPTER_TIER2_REGEX,
    tier3Regex: NEXT_CHAPTER_TIER3_REGEX
  };
  const PREV_CHAPTER_RULE = {
    rel: "prev",
    knownSelector: "#pb_prev, #prev_url, #pt_prev, #prevchapter, #linkPrev, a.prev-chapter",
    excludeRegex: PREV_CHAPTER_EXCLUDE_REGEX,
    tier1Regex: PREV_CHAPTER_TIER1_REGEX,
    tier2Regex: PREV_CHAPTER_TIER2_REGEX,
    tier3Regex: PREV_CHAPTER_TIER3_REGEX
  };
  const INVALID_HREF_PROTOCOL_REGEX = /^(?:javascript|mailto|tel):/i;
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
  function countEffectiveChars$1(paragraphs) {
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
  function measureTextStats(el) {
    let nonLinkChars = 0;
    let linkChars = 0;
    const walk = (node, inLink) => {
      if (node.nodeType === 3) {
        const len = (node.nodeValue || "").replace(/\s+/g, "").length;
        if (inLink) {
          linkChars += len;
        } else {
          nonLinkChars += len;
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const elem = node;
      if (NOISE_TAGS.has(elem.tagName)) return;
      const nextInLink = inLink || elem.tagName === "A";
      for (let i = 0; i < elem.childNodes.length; i++) {
        walk(elem.childNodes[i], nextInLink);
      }
    };
    walk(el, el.tagName === "A");
    return { nonLinkChars, linkChars };
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
    const candidates = Array.from(doc.querySelectorAll("article, section, div"));
    let bestElement = null;
    let maxNonLinkLength = 0;
    for (const cand of candidates) {
      if (NOISE_TAGS.has(cand.tagName)) continue;
      if (cand.querySelector("form, input, button") && !cand.querySelector("p, br")) {
        continue;
      }
      const stats = measureTextStats(cand);
      const totalChars = stats.nonLinkChars + stats.linkChars;
      if (totalChars === 0 || stats.nonLinkChars < MIN_CONTENT_CHAR_THRESHOLD) {
        continue;
      }
      if (stats.linkChars / totalChars > 0.45) {
        continue;
      }
      const innerBlocks = Array.from(cand.querySelectorAll("div, article, section"));
      const hasTighterInnerBlock = innerBlocks.some((child) => {
        if (NOISE_TAGS.has(child.tagName)) return false;
        const childStats = measureTextStats(child);
        const childTotal = childStats.nonLinkChars + childStats.linkChars;
        if (childTotal === 0 || childStats.linkChars / childTotal > 0.45) return false;
        return childStats.nonLinkChars >= stats.nonLinkChars * 0.8;
      });
      if (hasTighterInnerBlock) {
        continue;
      }
      if (stats.nonLinkChars > maxNonLinkLength) {
        maxNonLinkLength = stats.nonLinkChars;
        bestElement = cand;
      }
    }
    return maxNonLinkLength >= MIN_CONTENT_CHAR_THRESHOLD ? bestElement : null;
  }
  function findContentElement(doc) {
    const matched = findFallbackContentElement(doc);
    if (matched) return matched;
    const semantic = doc.querySelector("article, main");
    if (semantic) {
      const stats = measureTextStats(semantic);
      if (stats.nonLinkChars >= MIN_CONTENT_CHAR_THRESHOLD) {
        return semantic;
      }
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
  function resolveValidNextUrl(rawHref, resolveBaseUrl, currentParsed) {
    try {
      const absolute = new URL(rawHref, resolveBaseUrl);
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
  function extractChapterNavUrl(doc, currentUrl, rule) {
    var _a, _b, _c, _d;
    const pageUrl = currentUrl || doc.baseURI || "http://localhost";
    let currentParsed = null;
    try {
      currentParsed = new URL(pageUrl);
    } catch {
    }
    let resolveBaseUrl = pageUrl;
    const baseElHref = (_b = (_a = doc.querySelector("base[href]")) == null ? void 0 : _a.getAttribute("href")) == null ? void 0 : _b.trim();
    if (baseElHref) {
      try {
        resolveBaseUrl = new URL(baseElHref, pageUrl).href;
      } catch {
      }
    }
    const links = Array.from(doc.querySelectorAll("a"));
    let bestScore = 0;
    let bestUrl = null;
    for (const link of links) {
      const rawHref = ((_c = link.getAttribute("href")) == null ? void 0 : _c.trim()) || "";
      if (!rawHref || rawHref === "#" || INVALID_HREF_PROTOCOL_REGEX.test(rawHref)) {
        continue;
      }
      if (link.closest(".comment, #comments, .comments, .reply, .recommend")) {
        continue;
      }
      const compactText = cleanLine(link.textContent || "").replace(/\s+/g, "");
      const compactTitle = cleanLine(link.getAttribute("title") || "").replace(/\s+/g, "");
      if (rule.excludeRegex.test(compactText) || rule.excludeRegex.test(compactTitle)) {
        continue;
      }
      const isKnownSelector = ((_d = link.getAttribute("rel")) == null ? void 0 : _d.toLowerCase()) === rule.rel || link.matches(rule.knownSelector);
      let score = 0;
      if (rule.tier1Regex.test(compactText) || isKnownSelector) {
        score = 100;
      } else if (rule.tier2Regex.test(compactText)) {
        score = 70;
      } else if (rule.tier3Regex.test(compactText) && compactText.length <= 16 || rule.tier3Regex.test(compactTitle) && compactTitle.length <= 16) {
        score = 40;
      }
      if (score === 0) continue;
      const resolvedUrl = resolveValidNextUrl(rawHref, resolveBaseUrl, currentParsed);
      if (!resolvedUrl) continue;
      if (score >= bestScore) {
        bestScore = score;
        bestUrl = resolvedUrl;
      }
    }
    return bestUrl;
  }
  function extractNextChapterUrl(doc, currentUrl) {
    return extractChapterNavUrl(doc, currentUrl, NEXT_CHAPTER_RULE);
  }
  function extractPrevChapterUrl(doc, currentUrl) {
    return extractChapterNavUrl(doc, currentUrl, PREV_CHAPTER_RULE);
  }
  function extractChapterContent(doc, currentUrl) {
    const nextChapterUrl = extractNextChapterUrl(doc, currentUrl);
    const prevChapterUrl = extractPrevChapterUrl(doc, currentUrl);
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
    const effectiveChars = countEffectiveChars$1(paragraphs);
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
    if (countEffectiveChars$1(paragraphs) < MIN_CONTENT_CHAR_THRESHOLD) {
      paragraphs = [];
    }
    return {
      title,
      paragraphs,
      nextChapterUrl,
      prevChapterUrl
    };
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
  function splitTextToAtomicSentences(rawText, maxChars) {
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
    return atomicSentences;
  }
  function appendSegment(target, seg) {
    const last = target[target.length - 1];
    if (last && last.paragraphIndex === seg.paragraphIndex) {
      last.text += seg.text;
    } else {
      target.push({ paragraphIndex: seg.paragraphIndex, text: seg.text });
    }
  }
  function chunkParagraphs(paragraphs, options) {
    const minChars = DEFAULT_MIN_CHARS;
    const maxChars = DEFAULT_MAX_CHARS;
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      return [];
    }
    const atomicSegments = [];
    for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
      const pieces = splitTextToAtomicSentences(paragraphs[paragraphIndex], maxChars);
      for (const piece of pieces) {
        atomicSegments.push({ paragraphIndex, text: piece });
      }
    }
    if (atomicSegments.length === 0) {
      return [];
    }
    const merged = [];
    let bufferText = "";
    let bufferSegments = [];
    for (const seg of atomicSegments) {
      if (!bufferText) {
        bufferText = seg.text;
        bufferSegments = [{ paragraphIndex: seg.paragraphIndex, text: seg.text }];
        continue;
      }
      if (bufferText.length < minChars && bufferText.length + seg.text.length <= maxChars) {
        bufferText += seg.text;
        appendSegment(bufferSegments, seg);
      } else {
        merged.push({
          index: merged.length,
          text: bufferText,
          segments: bufferSegments
        });
        bufferText = seg.text;
        bufferSegments = [{ paragraphIndex: seg.paragraphIndex, text: seg.text }];
      }
    }
    if (bufferText) {
      if (bufferText.length < minChars && merged.length > 0 && merged[merged.length - 1].text.length + bufferText.length <= maxChars) {
        const prev = merged[merged.length - 1];
        prev.text += bufferText;
        for (const seg of bufferSegments) {
          appendSegment(prev.segments, seg);
        }
      } else {
        merged.push({
          index: merged.length,
          text: bufferText,
          segments: bufferSegments
        });
      }
    }
    const filtered = merged.filter((chunk) => !isPunctuationOrWhitespaceOnly(chunk.text));
    filtered.forEach((chunk, idx) => {
      chunk.index = idx;
    });
    return filtered;
  }
  function chunkText(input, options) {
    const paragraphs = Array.isArray(input) ? input : [input];
    return chunkParagraphs(paragraphs).map((chunk) => chunk.text);
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
        (_a = callbacks == null ? void 0 : callbacks.onError) == null ? void 0 : _a.call(callbacks, new Error("Web Speech Synthesis 在当前浏览器中不受支持"));
        return;
      }
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          this.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utterance;
        utterance.rate = Math.max(0.5, Math.min(2.5, options.rate || 1));
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
          (_a2 = callbacks == null ? void 0 : callbacks.onError) == null ? void 0 : _a2.call(callbacks, new Error(`SpeechSynthesis 朗读错误: ${event.error}`));
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
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
        this.currentUtterance = null;
      }
    }
  }
  const MAX_CACHE_SIZE = 3;
  const SILENT_AUDIO_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  class NovelPlayer {
    constructor(config) {
      __publicField(this, "state", "idle");
      __publicField(this, "provider");
      __publicField(this, "webSpeechEngine");
      __publicField(this, "isUsingFallback", false);
      // 单例音频实例与解锁状态
      __publicField(this, "audio");
      __publicField(this, "isAudioUnlocked", false);
      __publicField(this, "isSpeechUnlocked", false);
      // 异步竞态控制与重试定时器
      __publicField(this, "playToken", 0);
      __publicField(this, "retryTimer", null);
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
      this.rate = config.rate ?? 1;
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
      const wasActive = this.state === "playing" || this.state === "loading";
      const wasFallback = this.isUsingFallback;
      this.provider = provider;
      this.isUsingFallback = false;
      this.consecutiveFailures = 0;
      this.clearRetryTimer();
      this.clearPrefetchCache();
      if (wasActive) {
        if (wasFallback) {
          this.webSpeechEngine.cancel();
        } else if (this.audio && typeof this.audio.pause === "function") {
          this.audio.pause();
        }
        void this.playCurrentSentence();
      }
    }
    switchToFallback(reason) {
      var _a, _b;
      this.isUsingFallback = true;
      this.clearPrefetchCache();
      if (reason) {
        (_b = (_a = this.events).onToast) == null ? void 0 : _b.call(_a, reason);
      }
    }
    setState(newState) {
      var _a, _b;
      if (this.state === newState) return;
      this.state = newState;
      (_b = (_a = this.events).onStateChange) == null ? void 0 : _b.call(_a, newState);
      this.updateMediaSessionState();
    }
    clearRetryTimer() {
      if (this.retryTimer !== null) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    }
    // ─── 音频事件与同步解锁 ──────────────────────────────────────────────────
    setupAudioListeners() {
      if (!this.audio || typeof this.audio.addEventListener !== "function") return;
      this.audio.addEventListener("ended", () => {
        if (this.state !== "playing" || !this.audio.src || this.audio.src === SILENT_AUDIO_WAV) {
          return;
        }
        this.handleSentenceEnd();
      });
      this.audio.addEventListener("error", () => {
        if (this.state !== "playing" || !this.audio.src || this.audio.src === SILENT_AUDIO_WAV) {
          return;
        }
        void this.handlePlaybackFailure(new Error("Audio playback error"), this.playToken);
      });
    }
    /**
     * 同步解锁函数：必须在播放手势的第一行同步调用
     * 幂等解锁：1) <audio> 实例；2) window.speechSynthesis
     */
    unlockAllAudio(opts = {}) {
      const unlockAudio = opts.audio ?? true;
      const unlockSpeech = opts.speech ?? true;
      if (unlockAudio && !this.isAudioUnlocked && this.audio && typeof this.audio.play === "function") {
        try {
          if (!this.audio.src || this.audio.src === "" || this.audio.src === SILENT_AUDIO_WAV) {
            this.audio.src = SILENT_AUDIO_WAV;
            this.isAudioUnlocked = true;
            const playPromise = this.audio.play();
            if (playPromise && typeof playPromise.then === "function") {
              playPromise.then(() => {
                this.isAudioUnlocked = true;
              }).catch((err) => {
                if ((err == null ? void 0 : err.name) === "NotAllowedError") {
                  this.isAudioUnlocked = false;
                }
              });
            }
          }
        } catch {
          this.isAudioUnlocked = false;
        }
      }
      if (unlockSpeech && !this.isSpeechUnlocked && typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") {
        try {
          const dummyUtterance = new SpeechSynthesisUtterance("");
          dummyUtterance.volume = 0;
          window.speechSynthesis.speak(dummyUtterance);
          this.isSpeechUnlocked = true;
        } catch {
          this.isSpeechUnlocked = false;
        }
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
     * 仅清理未来预取缓存（保留当前正在播放句的 Blob URL，防止中断）
     */
    clearFuturePrefetchCache() {
      this.prefetchCache.forEach((item, key) => {
        if (key === this.currentIndex) return;
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
        this.prefetchCache.delete(key);
      });
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
        this.fetchSentenceBlob(next1).catch(() => {
        });
      }
      if (next2 < this.sentences.length) {
        this.fetchSentenceBlob(next2).catch(() => {
        });
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
      if (index < 0 || index >= this.sentences.length) {
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
      const item = { abortController };
      const promise = (async () => {
        try {
          let lastError = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            if (abortController.signal.aborted) {
              throw new DOMException("Aborted", "AbortError");
            }
            try {
              const blobUrl = await this.provider.synthesize(text, options);
              if (abortController.signal.aborted || this.prefetchCache.get(index) !== item) {
                try {
                  URL.revokeObjectURL(blobUrl);
                } catch {
                }
                throw new DOMException("Aborted", "AbortError");
              }
              item.blobUrl = blobUrl;
              return blobUrl;
            } catch (err) {
              if ((err == null ? void 0 : err.name) === "AbortError") throw err;
              lastError = err instanceof Error ? err : new Error(String(err));
            }
          }
          throw lastError || new Error(`Failed to synthesize sentence ${index}`);
        } catch (err) {
          if (this.prefetchCache.get(index) === item) {
            this.prefetchCache.delete(index);
          }
          throw err;
        }
      })();
      item.promise = promise;
      this.prefetchCache.set(index, item);
      return promise;
    }
    // ─── 核心播放逻辑 ─────────────────────────────────────────────────────
    /**
     * 载入章节并开始播放
     */
    async playChapter(chapter, startIndex = 0) {
      var _a, _b;
      this.clearRetryTimer();
      this.playToken++;
      if (this.state !== "idle") {
        this.stop();
      } else {
        this.clearPrefetchCache();
      }
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
      var _a, _b, _c, _d;
      this.clearRetryTimer();
      const token = ++this.playToken;
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
        if (token !== this.playToken || this.state !== "loading") {
          return;
        }
        this.audio.playbackRate = 1;
        this.audio.src = blobUrl;
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          try {
            await playPromise;
          } catch (playErr) {
            if (token !== this.playToken) {
              try {
                this.audio.pause();
              } catch {
              }
              return;
            }
            if ((playErr == null ? void 0 : playErr.name) === "NotAllowedError") {
              this.isAudioUnlocked = false;
              this.setState("paused");
              (_d = (_c = this.events).onToast) == null ? void 0 : _d.call(_c, "请再点一次播放解锁声音");
              return;
            }
            throw playErr;
          }
        }
        if (token !== this.playToken) {
          try {
            this.audio.pause();
          } catch {
          }
          return;
        }
        this.isAudioUnlocked = true;
        this.setState("playing");
        this.consecutiveFailures = 0;
        await this.requestWakeLock();
        if (token !== this.playToken || this.getState() !== "playing") {
          return;
        }
        this.triggerPrefetch();
      } catch (err) {
        if (token !== this.playToken || (err == null ? void 0 : err.name) === "AbortError") return;
        await this.handlePlaybackFailure(err instanceof Error ? err : new Error(String(err)), token);
      }
    }
    /**
     * 单句播放失败与自动降级处理
     */
    async handlePlaybackFailure(error, token) {
      var _a, _b, _c, _d;
      if (token !== this.playToken) return;
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2) {
        this.isUsingFallback = true;
        this.clearPrefetchCache();
        (_b = (_a = this.events).onToast) == null ? void 0 : _b.call(_a, `Edge TTS 异常 (${error.message})，已自动切换为系统语音朗读`);
        this.playViaWebSpeech(this.sentences[this.currentIndex]);
        return;
      }
      (_d = (_c = this.events).onError) == null ? void 0 : _d.call(_c, error);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (token === this.playToken && (this.state === "loading" || this.state === "playing")) {
          void this.playCurrentSentence();
        }
      }, 500);
    }
    /**
     * 通过 WebSpeech 进行兜底朗读
     */
    playViaWebSpeech(text) {
      this.setState("playing");
      this.isSpeechUnlocked = true;
      void this.requestWakeLock();
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
        void this.playCurrentSentence();
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
      this.clearRetryTimer();
      this.playToken++;
      if (this.isUsingFallback) {
        this.webSpeechEngine.pause();
      } else if (this.audio && typeof this.audio.pause === "function") {
        this.audio.pause();
      }
      this.releaseWakeLock();
      this.setState("paused");
    }
    resume() {
      var _a;
      if (this.state !== "paused") return;
      if (this.isUsingFallback) {
        if (typeof window !== "undefined" && ((_a = window.speechSynthesis) == null ? void 0 : _a.paused)) {
          this.setState("playing");
          void this.requestWakeLock();
          this.webSpeechEngine.resume();
        } else {
          void this.playCurrentSentence();
        }
        return;
      }
      if (!this.audio.src || this.audio.src === SILENT_AUDIO_WAV) {
        void this.playCurrentSentence();
        return;
      }
      this.setState("playing");
      void this.requestWakeLock();
      if (this.audio && typeof this.audio.play === "function") {
        this.audio.playbackRate = 1;
        const playPromise = this.audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(() => {
            this.isAudioUnlocked = true;
          }).catch((err) => {
            var _a2, _b;
            if ((err == null ? void 0 : err.name) === "NotAllowedError") {
              this.isAudioUnlocked = false;
              this.releaseWakeLock();
              this.setState("paused");
              (_b = (_a2 = this.events).onToast) == null ? void 0 : _b.call(_a2, "请再点一次播放解锁声音");
              return;
            }
            void this.playCurrentSentence();
          });
        }
      }
    }
    stop() {
      this.clearRetryTimer();
      this.playToken++;
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
      this.clearRetryTimer();
      this.unlockAllAudio({ audio: !this.isUsingFallback, speech: false });
      if (this.currentIndex < this.sentences.length - 1) {
        this.revokeCacheItem(this.currentIndex);
        this.currentIndex++;
        void this.playCurrentSentence();
      } else {
        this.handleChapterEnd();
      }
    }
    previousSentence() {
      if (this.sentences.length === 0) return;
      this.clearRetryTimer();
      this.unlockAllAudio({ audio: !this.isUsingFallback, speech: false });
      if (this.currentIndex > 0) {
        this.revokeCacheItem(this.currentIndex);
        this.currentIndex--;
      }
      void this.playCurrentSentence();
    }
    seek(index) {
      if (this.sentences.length === 0) return;
      this.clearRetryTimer();
      this.unlockAllAudio({ audio: !this.isUsingFallback, speech: false });
      const target = Math.max(0, Math.min(index, this.sentences.length - 1));
      this.clearPrefetchCache();
      this.currentIndex = target;
      void this.playCurrentSentence();
    }
    setRate(rate) {
      this.rate = rate;
      if (this.state === "playing") {
        if (this.isUsingFallback) {
          this.clearPrefetchCache();
          void this.playCurrentSentence();
        } else {
          this.clearFuturePrefetchCache();
          this.triggerPrefetch();
        }
      } else if (this.state === "loading") {
        this.clearPrefetchCache();
        void this.playCurrentSentence();
      } else {
        this.clearPrefetchCache();
      }
    }
    setVoice(voice) {
      this.voice = voice;
      this.clearPrefetchCache();
      if (this.state === "playing" || this.state === "loading") {
        void this.playCurrentSentence();
      }
    }
  }
  const DEFAULT_READER_SETTINGS = {
    theme: "sepia",
    fontSize: 18,
    lineHeight: 1.85,
    autoEnter: false
  };
  const VALID_THEMES = /* @__PURE__ */ new Set(["light", "sepia", "green", "dark"]);
  const DEFAULT_CONFIG = {
    workerUrl: "",
    token: "dev-secret",
    voice: "zh-CN-XiaoxiaoNeural",
    rate: 1,
    reader: { ...DEFAULT_READER_SETTINGS }
  };
  const STORAGE_KEY = "novel_tts_config";
  function normalizeReaderSettings(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const theme = src.theme && VALID_THEMES.has(src.theme) ? src.theme : DEFAULT_READER_SETTINGS.theme;
    const fontSize = typeof src.fontSize === "number" && Number.isFinite(src.fontSize) ? Math.max(14, Math.min(28, Math.round(src.fontSize))) : DEFAULT_READER_SETTINGS.fontSize;
    const lineHeight = typeof src.lineHeight === "number" && Number.isFinite(src.lineHeight) ? Math.max(1.4, Math.min(2.4, Number(src.lineHeight.toFixed(2)))) : DEFAULT_READER_SETTINGS.lineHeight;
    const autoEnter = typeof src.autoEnter === "boolean" ? src.autoEnter : DEFAULT_READER_SETTINGS.autoEnter;
    return { theme, fontSize, lineHeight, autoEnter };
  }
  class ConfigStorage {
    static isGMSupported() {
      return typeof GM_getValue === "function" && typeof GM_setValue === "function";
    }
    static normalizeConfig(parsed) {
      const merged = {
        ...DEFAULT_CONFIG,
        ...parsed,
        reader: normalizeReaderSettings(parsed.reader)
      };
      if (typeof merged.token !== "string" || merged.token.trim().length === 0) {
        merged.token = DEFAULT_CONFIG.token;
      }
      if (typeof merged.rate !== "number" || !Number.isFinite(merged.rate) || merged.rate <= 0) {
        merged.rate = DEFAULT_CONFIG.rate;
      }
      if (typeof merged.voice !== "string" || merged.voice.trim().length === 0) {
        merged.voice = DEFAULT_CONFIG.voice;
      }
      if (typeof merged.workerUrl !== "string") {
        merged.workerUrl = DEFAULT_CONFIG.workerUrl;
      }
      return merged;
    }
    static load() {
      try {
        if (this.isGMSupported()) {
          const raw = GM_getValue(STORAGE_KEY, null);
          if (raw) {
            const parsed = JSON.parse(raw);
            return this.normalizeConfig(parsed);
          }
        } else if (typeof localStorage !== "undefined") {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            return this.normalizeConfig(parsed);
          }
        }
      } catch {
      }
      return {
        ...DEFAULT_CONFIG,
        reader: { ...DEFAULT_READER_SETTINGS }
      };
    }
    static save(patch) {
      const current = this.load();
      const updated = this.normalizeConfig({
        ...current,
        ...patch,
        reader: patch.reader ? { ...current.reader, ...patch.reader } : current.reader
      });
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
    static saveReaderSettings(patch) {
      const current = this.load();
      return this.save({
        reader: {
          ...current.reader,
          ...patch
        }
      });
    }
  }
  function detectCharset(headers, buffer) {
    let headerCharset = "";
    if (typeof headers === "string") {
      const ctMatch = headers.match(/content-type:[^\r\n]*charset=([a-zA-Z0-9_-]+)/i);
      if (ctMatch) {
        headerCharset = ctMatch[1].toLowerCase();
      } else {
        const match = headers.match(/charset=([a-zA-Z0-9_-]+)/i);
        if (match) headerCharset = match[1].toLowerCase();
      }
    } else if (headers && typeof headers === "object") {
      const contentType = headers["content-type"] || headers["Content-Type"] || "";
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
  async function normalizeArrayBuffer(rawResponse) {
    let buffer = null;
    if (rawResponse instanceof ArrayBuffer) {
      buffer = rawResponse;
    } else if (ArrayBuffer.isView(rawResponse)) {
      const copy = new Uint8Array(rawResponse.byteLength);
      copy.set(
        new Uint8Array(
          rawResponse.buffer,
          rawResponse.byteOffset,
          rawResponse.byteLength
        )
      );
      buffer = copy.buffer;
    } else if (typeof Blob !== "undefined" && rawResponse instanceof Blob) {
      buffer = await rawResponse.arrayBuffer();
    }
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("抓取下一章返回空内容");
    }
    return buffer;
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
     * 判断目标章节是否与当前网页同源
     */
    isSameOrigin(targetUrl) {
      try {
        if (typeof window === "undefined" || !window.location) return false;
        const target = new URL(targetUrl);
        return target.origin === window.location.origin;
      } catch {
        return false;
      }
    }
    /**
     * 同源通道：通过原生 window.fetch 获取 HTML（保留 Cookie 与防爬凭证，含 10000ms 超时）
     */
    async fetchChapterViaNativeFetch(targetUrl) {
      var _a, _b;
      const timeoutController = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, 1e4);
      try {
        const fetchInit = {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          },
          signal: timeoutController.signal
        };
        if (typeof window !== "undefined" && ((_a = window.location) == null ? void 0 : _a.href)) {
          fetchInit.referrer = window.location.href;
        }
        const res = await window.fetch(targetUrl, fetchInit);
        if (!res.ok) {
          throw new Error(`同源 fetch 失败, HTTP ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        if (!buffer || buffer.byteLength === 0) {
          throw new Error("同源 fetch 返回空响应");
        }
        const contentType = ((_b = res.headers) == null ? void 0 : _b.get("content-type")) || "";
        const charset = detectCharset(contentType, buffer);
        try {
          const decoder = new TextDecoder(charset);
          return decoder.decode(buffer);
        } catch {
          const fallbackDecoder = new TextDecoder("utf-8");
          return fallbackDecoder.decode(buffer);
        }
      } catch (err) {
        if (timedOut) {
          throw new Error("同源 fetch 抓取下一章超时 (10000ms)");
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    /**
     * 兜底通道：通过 GM_xmlhttpRequest 获取 HTML（带 10000ms JS 超时保险丝）
     */
    async fetchChapterViaGM(targetUrl) {
      const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
      if (!gmRequest) {
        throw new Error("GM_xmlhttpRequest 在当前环境中不可用");
      }
      return new Promise((resolve, reject) => {
        var _a;
        let settled = false;
        let requestHandle = null;
        let timer = null;
        const cleanup = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        };
        const finishError = (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };
        const finishSuccess = (html) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(html);
        };
        timer = setTimeout(() => {
          try {
            if (requestHandle && typeof requestHandle.abort === "function") {
              requestHandle.abort();
            }
          } catch {
          }
          finishError(new Error("请求超时 (10000ms JS 保险丝触发)"));
        }, 1e4);
        try {
          const headers = {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          };
          if (typeof window !== "undefined" && ((_a = window.location) == null ? void 0 : _a.href)) {
            headers["Referer"] = window.location.href;
          }
          requestHandle = gmRequest({
            method: "GET",
            url: targetUrl,
            responseType: "arraybuffer",
            anonymous: false,
            // 附带 Cookie
            headers,
            timeout: 1e4,
            onload: async (resp) => {
              if (resp.status < 200 || resp.status >= 300) {
                finishError(new Error(`抓取下一章失败, HTTP ${resp.status}`));
                return;
              }
              try {
                const buffer = await normalizeArrayBuffer(resp.response);
                const charset = detectCharset(resp.responseHeaders || "", buffer);
                try {
                  const decoder = new TextDecoder(charset);
                  finishSuccess(decoder.decode(buffer));
                } catch {
                  const fallbackDecoder = new TextDecoder("utf-8");
                  finishSuccess(fallbackDecoder.decode(buffer));
                }
              } catch (err) {
                finishError(err instanceof Error ? err : new Error(String(err)));
              }
            },
            onerror: (err) => finishError(new Error(`网络错误 (GM_xhr): ${JSON.stringify(err)}`)),
            ontimeout: () => finishError(new Error("抓取下一章网络超时 (10000ms)"))
          });
        } catch (invokeErr) {
          finishError(new Error(`GM_xmlhttpRequest 触发失败: ${(invokeErr == null ? void 0 : invokeErr.message) || invokeErr}`));
        }
      });
    }
    /**
     * 静默拉取指定章节的 HTML 并解析正文
     * @param targetUrl 下一章完整 URL
     * @param options 加载选项（allowVisited 为 true 时允许重读已访问章节，如手动上一章）
     */
    async loadChapter(targetUrl, options) {
      const normalized = this.normalizeUrl(targetUrl);
      if (!normalized) {
        console.warn("[NovelTTS] Invalid chapter URL:", targetUrl);
        return null;
      }
      if (!(options == null ? void 0 : options.allowVisited) && this.visitedUrls.has(normalized)) {
        console.warn("[NovelTTS] Prevented loop: already visited URL:", normalized);
        return null;
      }
      let html = null;
      let nativeFetchError = null;
      if (this.isSameOrigin(targetUrl) && typeof window.fetch === "function") {
        try {
          html = await this.fetchChapterViaNativeFetch(targetUrl);
        } catch (fetchErr) {
          nativeFetchError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
          console.warn("[NovelTTS] 同源 fetch 失败，回退至 GM_xmlhttpRequest:", fetchErr);
        }
      }
      if (!html) {
        if (nativeFetchError && typeof GM_xmlhttpRequest !== "function") {
          throw nativeFetchError;
        }
        html = await this.fetchChapterViaGM(targetUrl);
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const content = extractChapterContent(doc, targetUrl);
      if (content.paragraphs.length > 0) {
        this.visitedUrls.add(normalized);
      }
      return content;
    }
  }
  class WorkerHttpError extends Error {
    constructor(status, message) {
      super(message);
      __publicField(this, "status");
      this.name = "WorkerHttpError";
      this.status = status;
    }
  }
  class EdgeWorkerTTSProvider {
    constructor(options) {
      __publicField(this, "name", "edge-worker");
      __publicField(this, "workerUrl");
      __publicField(this, "token");
      __publicField(this, "timeoutMs");
      __publicField(this, "lastUsedSource", null);
      this.workerUrl = this.sanitizeUrl(options.workerUrl);
      this.token = this.sanitizeToken(options.token);
      this.timeoutMs = options.timeoutMs ?? 8e3;
    }
    sanitizeUrl(url) {
      return url.trim().replace(/\/+$/, "").replace(/\/tts\/?$/i, "");
    }
    sanitizeToken(token) {
      const trimmed = (token ?? "").trim();
      return trimmed || "dev-secret";
    }
    updateConfig(workerUrl, token) {
      if (workerUrl !== void 0) {
        this.workerUrl = this.sanitizeUrl(workerUrl);
      }
      if (token !== void 0) {
        this.token = this.sanitizeToken(token);
      }
    }
    getLastUsedSource() {
      return this.lastUsedSource;
    }
    buildUrl(text, options, customUrl, customToken) {
      const baseUrl = customUrl !== void 0 ? this.sanitizeUrl(customUrl) : this.workerUrl;
      if (!baseUrl) {
        throw new Error("Worker 地址不能为空");
      }
      const token = customToken !== void 0 ? this.sanitizeToken(customToken) : this.sanitizeToken(this.token);
      const queryParams = new URLSearchParams({
        text: text.trim(),
        voice: options.voice || "zh-CN-XiaoxiaoNeural",
        rate: String(options.rate || 1),
        token
      });
      return `${baseUrl}/tts?${queryParams.toString()}`;
    }
    createHttpError(status, statusText) {
      if (status === 401) {
        return new WorkerHttpError(401, "HTTP 401 密钥错误: 当前 Token 与 Worker 环境变量 AUTH_TOKEN 不一致");
      }
      if (status === 502) {
        return new WorkerHttpError(502, "HTTP 502 上游异常: Edge TTS 微软服务端合成失败");
      }
      return new WorkerHttpError(status, `Edge Worker HTTP ${status}: ${statusText || "请求失败"}`);
    }
    /**
     * 将各种格式的响应转换为合法有效的 ArrayBuffer（校验 > 256 字节）
     */
    async normalizeAudioBuffer(rawResponse) {
      let buffer = null;
      if (rawResponse instanceof ArrayBuffer) {
        buffer = rawResponse;
      } else if (ArrayBuffer.isView(rawResponse)) {
        const copy = new Uint8Array(rawResponse.byteLength);
        copy.set(
          new Uint8Array(
            rawResponse.buffer,
            rawResponse.byteOffset,
            rawResponse.byteLength
          )
        );
        buffer = copy.buffer;
      } else if (typeof Blob !== "undefined" && rawResponse instanceof Blob) {
        buffer = await rawResponse.arrayBuffer();
      }
      if (!buffer || buffer.byteLength <= 256) {
        throw new Error(`音频数据无效或为空 (${buffer ? buffer.byteLength : 0} 字节)`);
      }
      return buffer;
    }
    /**
     * 主通道：通过 window.fetch 获取音频（含超时与外部 AbortSignal 联动）
     */
    async synthesizeViaFetch(targetUrl, signal) {
      if (signal == null ? void 0 : signal.aborted) {
        throw new DOMException("The synthesis request was aborted", "AbortError");
      }
      const timeoutController = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, this.timeoutMs);
      const onExternalAbort = () => {
        timeoutController.abort();
      };
      if (signal) {
        signal.addEventListener("abort", onExternalAbort, { once: true });
      }
      try {
        const res = await window.fetch(targetUrl, {
          method: "GET",
          mode: "cors",
          signal: timeoutController.signal
        });
        if (!res.ok) {
          throw this.createHttpError(res.status, res.statusText);
        }
        const buf = await res.arrayBuffer();
        return await this.normalizeAudioBuffer(buf);
      } catch (err) {
        if (timedOut) {
          throw new Error(`Edge Worker 请求超时 (${this.timeoutMs}ms)`);
        }
        if (signal == null ? void 0 : signal.aborted) {
          throw new DOMException("The synthesis request was aborted", "AbortError");
        }
        throw err;
      } finally {
        clearTimeout(timer);
        if (signal) {
          signal.removeEventListener("abort", onExternalAbort);
        }
      }
    }
    /**
     * 兜底通道：通过 GM_xmlhttpRequest 获取音频（带 8500ms JS 超时保险丝）
     */
    async synthesizeViaGM(targetUrl, signal) {
      if (signal == null ? void 0 : signal.aborted) {
        throw new DOMException("The synthesis request was aborted", "AbortError");
      }
      const gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
      if (!gmRequest) {
        throw new Error("GM_xmlhttpRequest 在当前环境中不可用");
      }
      return new Promise((resolve, reject) => {
        let settled = false;
        const finishError = (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };
        const finishSuccess = (buf) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(buf);
        };
        let requestHandle = null;
        let hardTimeoutTimer = null;
        const cleanup = () => {
          if (hardTimeoutTimer) {
            clearTimeout(hardTimeoutTimer);
            hardTimeoutTimer = null;
          }
          if (signal) {
            signal.removeEventListener("abort", onAbort);
          }
        };
        const onAbort = () => {
          try {
            if (requestHandle && typeof requestHandle.abort === "function") {
              requestHandle.abort();
            }
          } catch {
          }
          finishError(new DOMException("The synthesis request was aborted", "AbortError"));
        };
        if (signal) {
          signal.addEventListener("abort", onAbort);
        }
        hardTimeoutTimer = setTimeout(() => {
          try {
            if (requestHandle && typeof requestHandle.abort === "function") {
              requestHandle.abort();
            }
          } catch {
          }
          finishError(new Error("请求超时 (8500ms JS 保险丝触发)"));
        }, 8500);
        try {
          requestHandle = gmRequest({
            method: "GET",
            url: targetUrl,
            responseType: "arraybuffer",
            // 强制 arraybuffer，禁止 blob
            timeout: this.timeoutMs,
            onload: async (response) => {
              if (response.status < 200 || response.status >= 300) {
                finishError(this.createHttpError(response.status, response.statusText));
                return;
              }
              try {
                const buffer = await this.normalizeAudioBuffer(response.response);
                finishSuccess(buffer);
              } catch (err) {
                finishError(err instanceof Error ? err : new Error(String(err)));
              }
            },
            onerror: (err) => {
              finishError(new Error(`网络错误 (GM_xhr): ${JSON.stringify(err)}`));
            },
            ontimeout: () => {
              finishError(new Error(`Edge Worker 请求超时 (${this.timeoutMs}ms)`));
            }
          });
        } catch (invokeErr) {
          finishError(new Error(`GM_xmlhttpRequest 调用失败: ${(invokeErr == null ? void 0 : invokeErr.message) || invokeErr}`));
        }
      });
    }
    async synthesize(text, options) {
      var _a;
      if (!text || !text.trim()) {
        throw new Error("TTS 合成失败: 文本不能为空");
      }
      if ((_a = options.signal) == null ? void 0 : _a.aborted) {
        throw new DOMException("The synthesis request was aborted", "AbortError");
      }
      const targetUrl = this.buildUrl(text, options);
      let audioBuffer = null;
      let sourceUsed = "fetch";
      try {
        audioBuffer = await this.synthesizeViaFetch(targetUrl, options.signal);
        sourceUsed = "fetch";
      } catch (fetchErr) {
        if ((fetchErr == null ? void 0 : fetchErr.name) === "AbortError") {
          throw fetchErr;
        }
        if (fetchErr instanceof WorkerHttpError) {
          throw fetchErr;
        }
        if (typeof GM_xmlhttpRequest === "function") {
          try {
            audioBuffer = await this.synthesizeViaGM(targetUrl, options.signal);
            sourceUsed = "GM_xhr";
          } catch (gmErr) {
            if ((gmErr == null ? void 0 : gmErr.name) === "AbortError") {
              throw gmErr;
            }
            throw new Error(`双通道请求均失败 (fetch: ${fetchErr.message}; GM: ${gmErr.message})`);
          }
        } else {
          throw fetchErr;
        }
      }
      this.lastUsedSource = sourceUsed;
      const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
      return URL.createObjectURL(blob);
    }
    /**
     * 供 UI 设置抽屉使用的「测试连接」诊断方法
     */
    async testConnection(customUrl, customToken) {
      const startTime = Date.now();
      const testText = "测试";
      const testOptions = {
        voice: "zh-CN-XiaoxiaoNeural",
        rate: 1
      };
      try {
        const targetUrl = this.buildUrl(testText, testOptions, customUrl, customToken);
        let buffer;
        let source = "fetch";
        try {
          buffer = await this.synthesizeViaFetch(targetUrl);
          source = "fetch";
        } catch (fetchErr) {
          if (fetchErr instanceof WorkerHttpError) {
            throw fetchErr;
          }
          if (typeof GM_xmlhttpRequest === "function") {
            buffer = await this.synthesizeViaGM(targetUrl);
            source = "GM_xhr";
          } else {
            throw fetchErr;
          }
        }
        const duration = Date.now() - startTime;
        return {
          success: true,
          source,
          duration,
          bytes: buffer.byteLength
        };
      } catch (err) {
        const duration = Date.now() - startTime;
        return {
          success: false,
          duration,
          error: (err == null ? void 0 : err.message) || String(err)
        };
      }
    }
  }
  const VOICE_OPTIONS = [
    { value: "zh-CN-XiaoxiaoNeural", label: "晓晓 (女声·标准)" },
    { value: "zh-CN-YunxiNeural", label: "云希 (男声·生动)" },
    { value: "zh-CN-YunjianNeural", label: "云健 (男声·沉稳)" },
    { value: "zh-CN-XiaoyiNeural", label: "晓伊 (女声·灵动)" }
  ];
  const RATE_OPTIONS = [1, 1.2, 1.5, 2];
  const SVG_PLAY_PATH = '<path d="M8 5v14l11-7z"/>';
  const SVG_PAUSE_PATH = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  function buildVoiceOptionsHtml() {
    return VOICE_OPTIONS.map((v) => `<option value="${v.value}">${v.label}</option>`).join("");
  }
  function getNextRate(currentRate) {
    const idx = RATE_OPTIONS.findIndex((r) => Math.abs(r - currentRate) < 0.05);
    return RATE_OPTIONS[(idx + 1) % RATE_OPTIONS.length];
  }
  async function executeConnectionTest(opts) {
    const url = opts.urlInput.value.trim();
    const token = opts.tokenInput.value.trim();
    if (!url) {
      opts.onEmptyUrl();
      return;
    }
    opts.testBtn.disabled = true;
    opts.testBtn.textContent = "测试中…";
    opts.resultEl.className = "test-result";
    opts.resultEl.style.display = "none";
    try {
      const res = await opts.onTest(url, token);
      if (res.success) {
        opts.resultEl.className = "test-result success";
        opts.resultEl.textContent = `✅ 连接成功 (${res.source === "fetch" ? "原生 fetch" : "GM_xhr"}, 耗时 ${res.duration}ms, 大小 ${res.bytes}B)`;
      } else {
        opts.resultEl.className = "test-result error";
        opts.resultEl.textContent = `❌ 连接失败: ${res.error || "未知错误"}`;
      }
    } catch (err) {
      opts.resultEl.className = "test-result error";
      opts.resultEl.textContent = `❌ 测试异常: ${(err == null ? void 0 : err.message) || err}`;
    } finally {
      opts.resultEl.style.display = "block";
      opts.testBtn.disabled = false;
      opts.testBtn.textContent = "测试连接";
    }
  }
  class FloatingBar {
    constructor(config, events) {
      __publicField(this, "host");
      __publicField(this, "shadow");
      __publicField(this, "events");
      // 状态引用
      __publicField(this, "isSettingsOpen", false);
      __publicField(this, "isSuppressed", false);
      __publicField(this, "playerState", "idle");
      __publicField(this, "currentChapterUrl", null);
      __publicField(this, "currentRate", 1);
      __publicField(this, "ballPosition", null);
      // DOM 元素引用
      __publicField(this, "ballEl");
      __publicField(this, "panelEl");
      __publicField(this, "playBtn");
      __publicField(this, "titleEl");
      __publicField(this, "progressEl");
      __publicField(this, "rateBtn");
      __publicField(this, "voiceSelect");
      __publicField(this, "toastEl");
      __publicField(this, "settingsDrawer");
      __publicField(this, "workerInput");
      __publicField(this, "tokenInput");
      __publicField(this, "testBtn");
      __publicField(this, "testResultEl");
      __publicField(this, "jumpChapterBtn");
      __publicField(this, "toastTimer", null);
      // 需清理的全局监听器引用
      __publicField(this, "onWindowTouchMove", null);
      __publicField(this, "onWindowTouchEnd", null);
      __publicField(this, "onWindowMouseMove", null);
      __publicField(this, "onWindowMouseUp", null);
      __publicField(this, "onWindowResize", null);
      this.events = events;
      this.currentRate = config.rate;
      this.ballPosition = config.ballPosition ?? null;
      this.host = document.createElement("novel-tts-host");
      this.host.id = "novel-tts-floating-root";
      this.applyHostStyles();
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.render(config);
      this.applyBallPosition();
      this.bindEvents();
      this.bindDragEvents();
    }
    applyHostStyles() {
      this.host.style.setProperty("position", "fixed", "important");
      this.host.style.setProperty("inset", "0", "important");
      this.host.style.setProperty("z-index", "2147483647", "important");
      this.host.style.setProperty("pointer-events", "none", "important");
      this.host.style.setProperty("display", "block", "important");
      this.host.style.setProperty("margin", "0", "important");
      this.host.style.setProperty("padding", "0", "important");
      this.host.style.setProperty("border", "0", "important");
      this.host.style.setProperty("background", "transparent", "important");
    }
    mount(parent) {
      const target = parent || document.documentElement || document.body;
      if (target && !target.contains(this.host)) {
        target.appendChild(this.host);
      }
    }
    unmount() {
      if (this.toastTimer !== null) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
      if (this.onWindowTouchMove) {
        window.removeEventListener("touchmove", this.onWindowTouchMove);
        this.onWindowTouchMove = null;
      }
      if (this.onWindowTouchEnd) {
        window.removeEventListener("touchend", this.onWindowTouchEnd);
        this.onWindowTouchEnd = null;
      }
      if (this.onWindowMouseMove) {
        window.removeEventListener("mousemove", this.onWindowMouseMove);
        this.onWindowMouseMove = null;
      }
      if (this.onWindowMouseUp) {
        window.removeEventListener("mouseup", this.onWindowMouseUp);
        this.onWindowMouseUp = null;
      }
      if (this.onWindowResize) {
        window.removeEventListener("resize", this.onWindowResize);
        this.onWindowResize = null;
      }
      if (this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
    }
    toggleVisible() {
      if (this.host.style.display === "none") {
        this.host.style.setProperty("display", "block", "important");
      } else {
        this.host.style.setProperty("display", "none", "important");
      }
    }
    /** 阅读模式开启时抑制悬浮球与底栏面板，仅保留 Toast 提示 */
    setSuppressed(suppressed) {
      this.isSuppressed = suppressed;
      if (suppressed) {
        this.panelEl.classList.remove("open");
        this.ballEl.style.display = "none";
        this.panelEl.style.display = "none";
      } else {
        this.panelEl.style.display = "";
        this.ballEl.style.display = "flex";
      }
    }
    // ─── 状态更新接口 ──────────────────────────────────────────────────────
    updatePlayerState(state) {
      this.playerState = state;
      this.updatePlayButton();
      this.updateBallAnimation();
    }
    updateProgress(index, total, _sentence) {
      this.progressEl.textContent = `${index + 1} / ${total}`;
    }
    syncRate(rate) {
      this.currentRate = rate;
      this.rateBtn.textContent = `${rate.toFixed(1)}x`;
    }
    syncVoice(voice) {
      this.voiceSelect.value = voice;
    }
    updateChapter(title, currentUrl) {
      this.titleEl.textContent = title;
      if (currentUrl) {
        this.currentChapterUrl = currentUrl;
        this.jumpChapterBtn.style.display = "inline-block";
      } else {
        this.jumpChapterBtn.style.display = "none";
      }
    }
    syncConfigInputs(workerUrl, token) {
      this.workerInput.value = workerUrl;
      this.tokenInput.value = token;
    }
    showToast(message, duration = 3e3) {
      if (this.toastTimer !== null) {
        clearTimeout(this.toastTimer);
      }
      this.toastEl.textContent = message;
      this.toastEl.classList.add("visible");
      this.toastTimer = setTimeout(() => {
        this.toastEl.classList.remove("visible");
        this.toastTimer = null;
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
      }

      /* 悬浮小球 (折叠态) */
      .ball {
        position: fixed;
        bottom: 160px;
        right: 12px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: rgba(30, 41, 59, 0.92);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        touch-action: none;
        pointer-events: auto;
        transition: box-shadow 0.2s, background 0.2s;
        z-index: 2147483647;
      }
      .ball:active {
        cursor: grabbing;
        transform: scale(0.95);
      }
      .ball-icon {
        width: 22px;
        height: 22px;
        fill: #38bdf8;
        pointer-events: none;
      }
      .ball.playing {
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.65), 0 0 0 1px rgba(56, 189, 248, 0.5);
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
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.45);
        padding: 14px 16px env(safe-area-inset-bottom, 14px);
        box-sizing: border-box;
        pointer-events: auto;
        transform: translateY(105%);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 2147483647;
      }
      .panel.open {
        transform: translateY(0);
      }

      /* 头部信息区 */
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .title-box {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
        overflow: hidden;
      }
      .title {
        font-weight: 600;
        font-size: 15px;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .jump-btn {
        display: none;
        flex-shrink: 0;
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
        flex-shrink: 0;
        gap: 8px;
      }
      .reader-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(56, 189, 248, 0.16);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8;
        font-size: 11px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 10px;
        cursor: pointer;
        white-space: nowrap;
      }
      .reader-pill:active {
        background: rgba(56, 189, 248, 0.28);
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
        background: #0284c7;
        color: #ffffff;
        border: none;
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .save-btn:active {
        background: #0369a1;
      }
      .test-btn {
        background: rgba(255, 255, 255, 0.1);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.3);
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .test-btn:active {
        background: rgba(56, 189, 248, 0.2);
      }
      .test-result {
        display: none;
        margin-top: 8px;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .test-result.success {
        display: block;
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #86efac;
      }
      .test-result.error {
        display: block;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fca5a5;
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
        z-index: 2147483647;
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
            <button class="reader-pill" id="tts-reader-open" title="开启阅读模式">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
              </svg>
              <span>阅读</span>
            </button>
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
            ${buildVoiceOptionsHtml()}
          </select>
        </div>

        <!-- 设置抽屉 -->
        <div class="settings-drawer" id="tts-drawer">
          <div class="field">
            <label>Edge TTS Worker 地址 (URL)</label>
            <input type="text" id="tts-worker-url" placeholder="https://xxx.workers.dev 或 http://localhost:8787" />
          </div>
          <div class="field">
            <label>Worker 鉴权密钥 (Token，默认 dev-secret)</label>
            <input type="text" id="tts-token" placeholder="dev-secret" />
          </div>
          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button class="save-btn" id="tts-save-config" style="flex: 1;">保存配置</button>
            <button class="test-btn" id="tts-test-config" style="flex: 1;">测试连接</button>
          </div>
          <div class="test-result" id="tts-test-result"></div>
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
      this.rateBtn = this.shadow.querySelector("#tts-rate");
      this.voiceSelect = this.shadow.querySelector("#tts-voice");
      this.toastEl = this.shadow.querySelector("#tts-toast");
      this.settingsDrawer = this.shadow.querySelector("#tts-drawer");
      this.workerInput = this.shadow.querySelector("#tts-worker-url");
      this.tokenInput = this.shadow.querySelector("#tts-token");
      this.testBtn = this.shadow.querySelector("#tts-test-config");
      this.testResultEl = this.shadow.querySelector("#tts-test-result");
      this.jumpChapterBtn = this.shadow.querySelector("#tts-jump");
      this.workerInput.value = config.workerUrl;
      this.tokenInput.value = config.token;
      this.voiceSelect.value = config.voice;
    }
    clampOffsetTop(offsetTop) {
      const maxTop = Math.max(60, window.innerHeight - 80);
      return Math.max(60, Math.min(maxTop, offsetTop));
    }
    applyBallPosition() {
      if (!this.ballPosition) {
        return;
      }
      const { side, offsetTop } = this.ballPosition;
      const clampedTop = this.clampOffsetTop(offsetTop);
      this.ballEl.style.top = `${clampedTop}px`;
      this.ballEl.style.bottom = "auto";
      if (side === "left") {
        this.ballEl.style.left = "12px";
        this.ballEl.style.right = "auto";
      } else {
        this.ballEl.style.right = "12px";
        this.ballEl.style.left = "auto";
      }
    }
    // ─── 拖拽与吸附逻辑 ─────────────────────────────────────────────────────
    bindDragEvents() {
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      let isDragging = false;
      let hasMoved = false;
      const onStart = (clientX, clientY) => {
        isDragging = true;
        hasMoved = false;
        startX = clientX;
        startY = clientY;
        const rect = this.ballEl.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        this.ballEl.style.transition = "none";
      };
      const onMove = (clientX, clientY) => {
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (!hasMoved && Math.hypot(dx, dy) > 8) {
          hasMoved = true;
        }
        if (hasMoved) {
          let currentLeft = initialLeft + dx;
          let currentTop = initialTop + dy;
          const maxX = Math.max(0, window.innerWidth - 46);
          const maxY = Math.max(40, window.innerHeight - 46);
          currentLeft = Math.max(0, Math.min(maxX, currentLeft));
          currentTop = Math.max(40, Math.min(maxY - 40, currentTop));
          this.ballEl.style.left = `${currentLeft}px`;
          this.ballEl.style.top = `${currentTop}px`;
          this.ballEl.style.right = "auto";
          this.ballEl.style.bottom = "auto";
        }
      };
      const onEnd = () => {
        var _a, _b;
        if (!isDragging) return;
        isDragging = false;
        this.ballEl.style.transition = "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), right 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s";
        if (hasMoved) {
          const rect = this.ballEl.getBoundingClientRect();
          const screenWidth = window.innerWidth;
          const ballCenterX = rect.left + rect.width / 2;
          let side = "right";
          if (ballCenterX < screenWidth / 2) {
            side = "left";
            this.ballEl.style.left = "12px";
            this.ballEl.style.right = "auto";
          } else {
            side = "right";
            this.ballEl.style.right = "12px";
            this.ballEl.style.left = "auto";
          }
          const offsetTop = this.clampOffsetTop(rect.top);
          this.ballEl.style.top = `${offsetTop}px`;
          this.ballEl.style.bottom = "auto";
          this.ballPosition = { side, offsetTop };
          (_b = (_a = this.events).onBallPositionChange) == null ? void 0 : _b.call(_a, this.ballPosition);
        }
      };
      this.ballEl.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches.length === 1) {
            onStart(e.touches[0].clientX, e.touches[0].clientY);
          }
        },
        { passive: true }
      );
      this.onWindowTouchMove = (e) => {
        if (isDragging && e.touches.length === 1) {
          onMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      this.onWindowTouchEnd = () => {
        onEnd();
      };
      window.addEventListener("touchmove", this.onWindowTouchMove, { passive: true });
      window.addEventListener("touchend", this.onWindowTouchEnd);
      this.ballEl.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
          onStart(e.clientX, e.clientY);
        }
      });
      this.onWindowMouseMove = (e) => {
        if (isDragging) {
          onMove(e.clientX, e.clientY);
        }
      };
      this.onWindowMouseUp = () => {
        onEnd();
      };
      window.addEventListener("mousemove", this.onWindowMouseMove);
      window.addEventListener("mouseup", this.onWindowMouseUp);
      this.onWindowResize = () => {
        this.applyBallPosition();
      };
      window.addEventListener("resize", this.onWindowResize);
      this.ballEl.addEventListener("click", (e) => {
        if (hasMoved) {
          e.stopPropagation();
          hasMoved = false;
          return;
        }
        this.expandPanel();
      });
    }
    // ─── 事件绑定 ─────────────────────────────────────────────────────────
    bindEvents() {
      this.shadow.querySelector("#tts-close").addEventListener("click", () => {
        this.collapsePanel();
      });
      this.shadow.querySelector("#tts-reader-open").addEventListener("click", () => {
        this.collapsePanel();
        this.events.onOpenReader();
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
      this.rateBtn.addEventListener("click", () => {
        this.currentRate = getNextRate(this.currentRate);
        this.rateBtn.textContent = `${this.currentRate.toFixed(1)}x`;
        this.events.onRateChange(this.currentRate);
        this.showToast(`语速已切换为 ${this.currentRate.toFixed(1)}x`);
      });
      this.voiceSelect.addEventListener("change", () => {
        this.events.onVoiceChange(this.voiceSelect.value);
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
      });
      this.testBtn.addEventListener("click", () => {
        void executeConnectionTest({
          urlInput: this.workerInput,
          tokenInput: this.tokenInput,
          testBtn: this.testBtn,
          resultEl: this.testResultEl,
          onTest: (url, token) => this.events.onTestConfig(url, token),
          onEmptyUrl: () => this.showToast("请先输入 Worker 地址")
        });
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
      if (this.isSuppressed) return;
      this.panelEl.classList.add("open");
      this.ballEl.style.display = "none";
    }
    collapsePanel() {
      this.panelEl.classList.remove("open");
      this.ballEl.style.display = this.isSuppressed ? "none" : "flex";
    }
    updatePlayButton() {
      const icon = this.shadow.querySelector("#tts-play-icon");
      if (this.playerState === "playing") {
        icon.innerHTML = SVG_PAUSE_PATH;
        this.playBtn.title = "暂停";
      } else if (this.playerState === "loading") {
        icon.innerHTML = SVG_PLAY_PATH;
        this.playBtn.title = "加载中…";
      } else {
        icon.innerHTML = SVG_PLAY_PATH;
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
  const USER_SCROLL_PROTECT_MS$1 = 4e3;
  const LINE_HEIGHT_PRESETS = [
    { value: 1.6, label: "紧凑" },
    { value: 1.85, label: "适中" },
    { value: 2.1, label: "宽松" }
  ];
  const THEME_PRESETS = [
    { value: "light", label: "日间", swatch: "#ffffff" },
    { value: "sepia", label: "羊皮纸", swatch: "#f4ecd8" },
    { value: "green", label: "护眼绿", swatch: "#cce8cf" },
    { value: "dark", label: "夜间", swatch: "#141923" }
  ];
  class ReaderView {
    constructor(config, events) {
      __publicField(this, "host");
      __publicField(this, "shadow");
      __publicField(this, "events");
      __publicField(this, "settings");
      __publicField(this, "currentRate");
      __publicField(this, "playerState", "idle");
      __publicField(this, "activeChunkIndex", -1);
      __publicField(this, "totalChunks", 0);
      __publicField(this, "currentChapterUrl", null);
      __publicField(this, "hasPrevChapter", false);
      __publicField(this, "hasNextChapter", false);
      __publicField(this, "isChapterLoading", false);
      __publicField(this, "opened", false);
      __publicField(this, "isMenuOpen", false);
      __publicField(this, "activeSubpanel", "none");
      // 原网页滚动锁定备份
      __publicField(this, "savedHtmlOverflow", null);
      __publicField(this, "savedBodyOverflow", null);
      // 手动滑动保护与双击识别
      __publicField(this, "lastUserScrollAt", 0);
      __publicField(this, "programmaticScrollUntil", 0);
      __publicField(this, "lastTapChunkIdx", -1);
      __publicField(this, "lastTapAt", 0);
      __publicField(this, "singleTapTimer", null);
      // DOM 引用
      __publicField(this, "rootEl");
      __publicField(this, "scrollEl");
      __publicField(this, "statusTitleEl");
      __publicField(this, "statusProgressEl");
      __publicField(this, "articleTitleEl");
      __publicField(this, "articleBodyEl");
      __publicField(this, "footerPrevBtn");
      __publicField(this, "footerNextBtn");
      __publicField(this, "relocateBtn");
      __publicField(this, "miniBarEl");
      __publicField(this, "miniPlayBtn");
      __publicField(this, "miniPlayIcon");
      __publicField(this, "miniProgressEl");
      __publicField(this, "topBarEl");
      __publicField(this, "topTitleEl");
      __publicField(this, "jumpBtn");
      __publicField(this, "bottomDockEl");
      __publicField(this, "panelAppearanceEl");
      __publicField(this, "panelTtsEl");
      __publicField(this, "panelWorkerEl");
      __publicField(this, "fontValEl");
      __publicField(this, "autoEnterInput");
      __publicField(this, "ttsProgressEl");
      __publicField(this, "ttsPlayBtn");
      __publicField(this, "ttsPlayIcon");
      __publicField(this, "rateBtn");
      __publicField(this, "voiceSelect");
      __publicField(this, "workerInput");
      __publicField(this, "tokenInput");
      __publicField(this, "testBtn");
      __publicField(this, "testResultEl");
      __publicField(this, "dockPrevChBtn");
      __publicField(this, "dockTtsBtn");
      __publicField(this, "dockAppearanceBtn");
      __publicField(this, "dockNextChBtn");
      this.events = events;
      this.settings = { ...config.reader };
      this.currentRate = config.rate;
      this.host = document.createElement("novel-tts-reader-host");
      this.host.id = "novel-tts-reader-root";
      this.applyHostStyles();
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.render(config);
      this.applySettings(this.settings);
      this.bindEvents();
    }
    applyHostStyles() {
      this.host.style.setProperty("position", "fixed", "important");
      this.host.style.setProperty("inset", "0", "important");
      this.host.style.setProperty("z-index", "2147483645", "important");
      this.host.style.setProperty("display", "none", "important");
      this.host.style.setProperty("margin", "0", "important");
      this.host.style.setProperty("padding", "0", "important");
      this.host.style.setProperty("border", "0", "important");
      this.host.style.setProperty("background", "transparent", "important");
    }
    mount(parent) {
      const target = parent || document.documentElement || document.body;
      if (target && !target.contains(this.host)) {
        target.appendChild(this.host);
      }
    }
    unmount() {
      this.clearSingleTapTimer();
      this.restorePageOverflow();
      if (this.host.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
    }
    isOpen() {
      return this.opened;
    }
    open() {
      if (this.opened) return;
      this.opened = true;
      this.mount();
      if (typeof document !== "undefined") {
        this.savedHtmlOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
        if (document.body) {
          this.savedBodyOverflow = document.body.style.overflow;
          document.body.style.overflow = "hidden";
        }
      }
      this.host.style.setProperty("display", "block", "important");
      this.setMenuOpen(false);
      this.updateScrollStatus();
      this.updateRelocateVisibility();
    }
    close() {
      if (!this.opened) return;
      this.opened = false;
      this.clearSingleTapTimer();
      this.setMenuOpen(false);
      this.host.style.setProperty("display", "none", "important");
      this.restorePageOverflow();
    }
    restorePageOverflow() {
      if (typeof document === "undefined") return;
      if (this.savedHtmlOverflow !== null) {
        document.documentElement.style.overflow = this.savedHtmlOverflow;
        this.savedHtmlOverflow = null;
      }
      if (this.savedBodyOverflow !== null && document.body) {
        document.body.style.overflow = this.savedBodyOverflow;
        this.savedBodyOverflow = null;
      }
    }
    clearSingleTapTimer() {
      if (this.singleTapTimer !== null) {
        clearTimeout(this.singleTapTimer);
        this.singleTapTimer = null;
      }
      this.lastTapChunkIdx = -1;
      this.lastTapAt = 0;
    }
    notifyToast(message) {
      var _a, _b;
      (_b = (_a = this.events).onToast) == null ? void 0 : _b.call(_a, message);
    }
    // ─── 章节渲染与状态同步 ────────────────────────────────────────────────
    renderChapter(chapter, chunks, chapterUrl) {
      const title = chapter.title || "正文阅读";
      this.statusTitleEl.textContent = title;
      this.topTitleEl.textContent = title;
      this.articleTitleEl.textContent = title;
      this.currentChapterUrl = chapterUrl || null;
      this.jumpBtn.style.display = chapterUrl ? "inline-flex" : "none";
      this.hasPrevChapter = Boolean(chapter.prevChapterUrl);
      this.hasNextChapter = Boolean(chapter.nextChapterUrl);
      this.updateChapterButtonsDisabled();
      this.totalChunks = chunks.length;
      this.activeChunkIndex = -1;
      this.lastUserScrollAt = 0;
      const segmentsByParagraph = /* @__PURE__ */ new Map();
      for (const chunk of chunks) {
        for (const seg of chunk.segments) {
          let list = segmentsByParagraph.get(seg.paragraphIndex);
          if (!list) {
            list = [];
            segmentsByParagraph.set(seg.paragraphIndex, list);
          }
          list.push({ chunkIndex: chunk.index, text: seg.text });
        }
      }
      const fragment = document.createDocumentFragment();
      chapter.paragraphs.forEach((paraText, pIdx) => {
        const pEl = document.createElement("p");
        pEl.className = "reader-p";
        const segs = segmentsByParagraph.get(pIdx);
        if (segs && segs.length > 0) {
          for (const seg of segs) {
            const span = document.createElement("span");
            span.className = "reader-sentence";
            span.setAttribute("data-chunk-index", String(seg.chunkIndex));
            span.textContent = seg.text;
            pEl.appendChild(span);
          }
        } else {
          pEl.textContent = paraText;
        }
        fragment.appendChild(pEl);
      });
      this.articleBodyEl.replaceChildren(fragment);
      this.programmaticScrollUntil = Date.now() + 300;
      this.scrollEl.scrollTop = 0;
      this.updateScrollStatus();
      this.updateRelocateVisibility();
    }
    setActiveChunk(index) {
      this.activeChunkIndex = index;
      const prevActives = this.articleBodyEl.querySelectorAll(".reader-sentence.active");
      prevActives.forEach((el) => el.classList.remove("active"));
      if (index < 0) {
        this.updateRelocateVisibility();
        this.updateScrollStatus();
        return;
      }
      const targets = this.articleBodyEl.querySelectorAll(
        `.reader-sentence[data-chunk-index="${index}"]`
      );
      targets.forEach((el) => el.classList.add("active"));
      const firstEl = targets[0];
      if (firstEl && Date.now() - this.lastUserScrollAt > USER_SCROLL_PROTECT_MS$1) {
        this.scrollToSentenceEl(firstEl);
      }
      this.updateScrollStatus();
      this.updateRelocateVisibility();
    }
    scrollToSentenceEl(el) {
      const scrollRect = this.scrollEl.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (scrollRect.height <= 0) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
        }
        return;
      }
      const offsetTop = elRect.top - scrollRect.top + this.scrollEl.scrollTop;
      const targetTop = Math.max(0, offsetTop - scrollRect.height * 0.38);
      this.programmaticScrollUntil = Date.now() + 700;
      if (typeof this.scrollEl.scrollTo === "function") {
        try {
          this.scrollEl.scrollTo({ top: targetTop, behavior: "smooth" });
        } catch {
          this.scrollEl.scrollTop = targetTop;
        }
      } else {
        this.scrollEl.scrollTop = targetTop;
      }
    }
    setChapterLoading(loading) {
      this.isChapterLoading = loading;
      this.updateChapterButtonsDisabled();
    }
    updateChapterButtonsDisabled() {
      const prevDisabled = this.isChapterLoading || !this.hasPrevChapter;
      const nextDisabled = this.isChapterLoading || !this.hasNextChapter;
      this.footerPrevBtn.disabled = prevDisabled;
      this.dockPrevChBtn.disabled = prevDisabled;
      this.footerNextBtn.disabled = nextDisabled;
      this.dockNextChBtn.disabled = nextDisabled;
    }
    updatePlayerState(state) {
      this.playerState = state;
      const playIconPath = state === "playing" ? SVG_PAUSE_PATH : SVG_PLAY_PATH;
      const playLabel = state === "playing" ? "暂停" : state === "loading" ? "加载中…" : "播放";
      this.miniPlayIcon.innerHTML = playIconPath;
      this.miniPlayBtn.title = playLabel;
      this.ttsPlayIcon.innerHTML = playIconPath;
      this.ttsPlayBtn.title = playLabel;
      this.dockTtsBtn.classList.toggle("is-playing", this.isTtsActive());
      this.updateMiniBarVisibility();
      this.updateScrollStatus();
      this.updateRelocateVisibility();
    }
    updateProgress(index, total) {
      this.totalChunks = total;
      const text = total > 0 ? `${index + 1} / ${total}` : "0 / 0";
      this.miniProgressEl.textContent = text;
      this.ttsProgressEl.textContent = total > 0 ? `第 ${index + 1} / ${total} 句` : "0 / 0";
      this.updateScrollStatus();
    }
    syncRate(rate) {
      this.currentRate = rate;
      this.rateBtn.textContent = `${rate.toFixed(1)}x`;
    }
    syncVoice(voice) {
      this.voiceSelect.value = voice;
    }
    syncConfigInputs(workerUrl, token) {
      this.workerInput.value = workerUrl;
      this.tokenInput.value = token;
    }
    applySettings(settings) {
      this.settings = { ...settings };
      this.rootEl.setAttribute("data-theme", settings.theme);
      this.rootEl.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
      this.rootEl.style.setProperty("--reader-line-height", String(settings.lineHeight));
      this.fontValEl.textContent = `${settings.fontSize}px`;
      this.autoEnterInput.checked = Boolean(settings.autoEnter);
      this.shadow.querySelectorAll("[data-theme-opt]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.themeOpt === settings.theme);
      });
      this.shadow.querySelectorAll("[data-line-height]").forEach((btn) => {
        const val = Number.parseFloat(btn.dataset.lineHeight || "0");
        btn.classList.toggle("active", Math.abs(val - settings.lineHeight) < 0.05);
      });
    }
    isTtsActive() {
      return this.playerState === "playing" || this.playerState === "loading" || this.playerState === "paused";
    }
    updateMiniBarVisibility() {
      const show = this.isTtsActive() && !this.isMenuOpen;
      this.miniBarEl.classList.toggle("visible", show);
    }
    updateScrollStatus() {
      if (this.isTtsActive() && this.totalChunks > 0 && this.activeChunkIndex >= 0) {
        this.statusProgressEl.textContent = `🔊 ${this.activeChunkIndex + 1} / ${this.totalChunks}`;
        return;
      }
      const maxScroll = Math.max(0, this.scrollEl.scrollHeight - this.scrollEl.clientHeight);
      if (maxScroll <= 0) {
        this.statusProgressEl.textContent = "0%";
        return;
      }
      const pct = Math.max(
        0,
        Math.min(100, Math.round(this.scrollEl.scrollTop / maxScroll * 100))
      );
      this.statusProgressEl.textContent = `${pct}%`;
    }
    updateRelocateVisibility() {
      if (!this.isTtsActive() || this.activeChunkIndex < 0) {
        this.relocateBtn.classList.remove("visible");
        return;
      }
      const activeEl = this.articleBodyEl.querySelector(
        `.reader-sentence[data-chunk-index="${this.activeChunkIndex}"]`
      );
      if (!activeEl) {
        this.relocateBtn.classList.remove("visible");
        return;
      }
      const scrollRect = this.scrollEl.getBoundingClientRect();
      if (scrollRect.height <= 0) {
        this.relocateBtn.classList.remove("visible");
        return;
      }
      const elRect = activeEl.getBoundingClientRect();
      const outOfView = elRect.bottom < scrollRect.top + 36 || elRect.top > scrollRect.bottom - 36;
      this.relocateBtn.classList.toggle("visible", outOfView);
    }
    setMenuOpen(open, initialPanel = "none") {
      this.isMenuOpen = open;
      this.topBarEl.classList.toggle("open", open);
      this.bottomDockEl.classList.toggle("open", open);
      this.setSubpanel(open ? initialPanel : "none");
      this.updateMiniBarVisibility();
    }
    setSubpanel(panel) {
      this.activeSubpanel = panel;
      this.panelAppearanceEl.classList.toggle("open", panel === "appearance");
      this.panelTtsEl.classList.toggle("open", panel === "tts");
      this.panelWorkerEl.classList.toggle("open", panel === "worker");
      this.dockAppearanceBtn.classList.toggle("active", panel === "appearance");
      this.dockTtsBtn.classList.toggle("active", panel === "tts");
    }
    updateSettings(patch) {
      const next = { ...this.settings, ...patch };
      this.applySettings(next);
      this.events.onSettingsChange(patch);
    }
    // ─── DOM 渲染 ──────────────────────────────────────────────────────────
    render(config) {
      const style = document.createElement("style");
      style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", Roboto, sans-serif;
        -webkit-tap-highlight-color: transparent;
      }

      .reader-root {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        background: var(--bg);
        color: var(--text);
        --reader-font-size: 18px;
        --reader-line-height: 1.85;
      }

      /* 4 套夸克风格主题 */
      .reader-root[data-theme="light"] {
        --bg: #f8fafc;
        --surface: #ffffff;
        --dock-bg: rgba(255, 255, 255, 0.96);
        --text: #1e293b;
        --muted: #64748b;
        --border: rgba(15, 23, 42, 0.1);
        --hl-bg: rgba(14, 165, 233, 0.2);
        --hl-text: #0f172a;
        --accent: #0284c7;
        --btn-bg: rgba(15, 23, 42, 0.06);
      }
      .reader-root[data-theme="sepia"] {
        --bg: #f4ecd8;
        --surface: #efe4c8;
        --dock-bg: rgba(246, 238, 218, 0.96);
        --text: #3d3122;
        --muted: #7c6950;
        --border: rgba(61, 49, 34, 0.12);
        --hl-bg: rgba(217, 119, 6, 0.22);
        --hl-text: #291f14;
        --accent: #b45309;
        --btn-bg: rgba(61, 49, 34, 0.08);
      }
      .reader-root[data-theme="green"] {
        --bg: #cce8cf;
        --surface: #d8efd9;
        --dock-bg: rgba(212, 238, 215, 0.96);
        --text: #1e3322;
        --muted: #4b6950;
        --border: rgba(30, 51, 34, 0.12);
        --hl-bg: rgba(16, 185, 129, 0.26);
        --hl-text: #0f2414;
        --accent: #059669;
        --btn-bg: rgba(30, 51, 34, 0.08);
      }
      .reader-root[data-theme="dark"] {
        --bg: #12151c;
        --surface: #1a1f29;
        --dock-bg: rgba(20, 25, 36, 0.96);
        --text: #cbd5e1;
        --muted: #64748b;
        --border: rgba(255, 255, 255, 0.1);
        --hl-bg: rgba(56, 189, 248, 0.22);
        --hl-text: #f8fafc;
        --accent: #38bdf8;
        --btn-bg: rgba(255, 255, 255, 0.08);
      }

      /* 顶部常驻极简微状态栏 */
      .status-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: calc(30px + env(safe-area-inset-top, 0px));
        padding: env(safe-area-inset-top, 0px) 18px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 11px;
        color: var(--muted);
        background: var(--bg);
        z-index: 2;
        pointer-events: none;
        box-sizing: border-box;
      }
      .status-title {
        min-width: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .status-progress {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }

      /* 竖向滚动正文区 */
      .reader-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: manipulation;
      }
      .reader-article {
        max-width: 720px;
        margin: 0 auto;
        padding: calc(44px + env(safe-area-inset-top, 0px)) 20px calc(110px + env(safe-area-inset-bottom, 0px));
        box-sizing: border-box;
      }
      .reader-chapter-title {
        font-size: calc(var(--reader-font-size) + 4px);
        line-height: 1.4;
        font-weight: 700;
        margin: 0 0 22px;
        color: var(--hl-text);
      }
      .reader-p {
        margin: 0 0 0.85em;
        font-size: var(--reader-font-size);
        line-height: var(--reader-line-height);
        text-indent: 2em;
        word-break: break-word;
      }
      .reader-sentence {
        border-radius: 3px;
        transition: background-color 0.2s, color 0.2s;
      }
      .reader-sentence.active {
        background: var(--hl-bg);
        color: var(--hl-text);
        box-shadow: 0 0 0 2px var(--hl-bg);
      }

      /* 章节底部上下章翻页按钮 */
      .reader-footer-nav {
        display: flex;
        gap: 12px;
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
      }
      .footer-nav-btn {
        flex: 1;
        height: 44px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--btn-bg);
        color: var(--text);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .footer-nav-btn.primary {
        border-color: var(--accent);
        color: var(--accent);
      }
      .footer-nav-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      /* 回到朗读处浮动胶囊 */
      .relocate-btn {
        position: fixed;
        right: 16px;
        bottom: calc(74px + env(safe-area-inset-bottom, 0px));
        padding: 7px 12px;
        border-radius: 18px;
        border: 1px solid var(--accent);
        background: var(--dock-bg);
        color: var(--accent);
        font-size: 12px;
        font-weight: 500;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px);
        transition: opacity 0.2s, transform 0.2s;
        z-index: 4;
      }
      .relocate-btn.visible {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      /* 迷你底部听书栏 (无正文文字预览，仅控播与进度) */
      .mini-tts-bar {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        height: 48px;
        padding: 0 12px;
        border-radius: 24px;
        background: var(--dock-bg);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--border);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        z-index: 4;
        box-sizing: border-box;
      }
      .mini-tts-bar.visible {
        display: flex;
      }
      .mini-controls {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .mini-btn {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: none;
        background: var(--btn-bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .mini-btn.primary {
        background: var(--accent);
        color: #ffffff;
      }
      .mini-btn svg {
        fill: currentColor;
      }
      .mini-progress {
        font-size: 12px;
        color: var(--muted);
        font-variant-numeric: tabular-nums;
      }

      /* 仿夸克滑出顶栏 */
      .top-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px;
        background: var(--dock-bg);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        transform: translateY(-105%);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 6;
        box-sizing: border-box;
      }
      .top-bar.open {
        transform: translateY(0);
      }
      .top-title {
        flex: 1;
        min-width: 0;
        text-align: center;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bar-text-btn {
        border: none;
        background: none;
        color: var(--text);
        font-size: 13px;
        padding: 5px 8px;
        border-radius: 6px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .bar-text-btn.accent {
        color: var(--accent);
        background: var(--btn-bg);
        font-size: 12px;
      }

      /* 仿夸克滑出底栏 */
      .bottom-dock {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
        background: var(--dock-bg);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-top: 1px solid var(--border);
        box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.18);
        transform: translateY(105%);
        transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 6;
        box-sizing: border-box;
      }
      .bottom-dock.open {
        transform: translateY(0);
      }

      .subpanel {
        display: none;
        padding-bottom: 12px;
        margin-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }
      .subpanel.open {
        display: block;
      }

      /* 排版设置行 */
      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .setting-row:last-child {
        margin-bottom: 0;
      }
      .setting-label {
        font-size: 12px;
        color: var(--muted);
        flex-shrink: 0;
      }
      .btn-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        justify-content: flex-end;
      }
      .pill-btn {
        border: 1px solid var(--border);
        background: var(--btn-bg);
        color: var(--text);
        font-size: 12px;
        padding: 5px 12px;
        border-radius: 14px;
        cursor: pointer;
      }
      .pill-btn.active {
        border-color: var(--accent);
        color: var(--accent);
        font-weight: 600;
      }
      .font-val {
        font-size: 13px;
        min-width: 40px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .theme-swatch {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--btn-bg);
        color: var(--text);
        font-size: 11px;
        cursor: pointer;
      }
      .theme-swatch.active {
        border-color: var(--accent);
        color: var(--accent);
        font-weight: 600;
      }
      .swatch-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(128, 128, 128, 0.35);
      }
      .switch-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text);
        cursor: pointer;
      }

      /* 听书设置子面板 (无正文预览框) */
      .tts-info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 10px;
      }
      .tts-controls-row {
        display: flex;
        align-items: center;
        justify-content: space-around;
        margin-bottom: 10px;
      }
      .tts-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: var(--btn-bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .tts-btn.primary {
        width: 50px;
        height: 50px;
        background: var(--accent);
        color: #ffffff;
      }
      .tts-btn svg {
        fill: currentColor;
      }
      .tts-params-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .voice-select {
        background: var(--btn-bg);
        border: 1px solid var(--border);
        color: var(--text);
        font-size: 12px;
        padding: 5px 8px;
        border-radius: 8px;
        outline: none;
        max-width: 135px;
      }
      .voice-select option {
        background: var(--surface);
        color: var(--text);
      }

      /* Worker 配置子面板 */
      .field {
        margin-bottom: 8px;
      }
      .field label {
        display: block;
        font-size: 11px;
        color: var(--muted);
        margin-bottom: 4px;
      }
      .field input {
        width: 100%;
        box-sizing: border-box;
        background: var(--btn-bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 6px 10px;
        color: var(--text);
        font-size: 12px;
        outline: none;
      }
      .worker-btn-row {
        display: flex;
        gap: 8px;
      }
      .save-btn {
        flex: 1;
        background: var(--accent);
        color: #ffffff;
        border: none;
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .test-btn {
        flex: 1;
        background: var(--btn-bg);
        color: var(--accent);
        border: 1px solid var(--accent);
        padding: 7px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .test-result {
        display: none;
        margin-top: 8px;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .test-result.success {
        display: block;
        background: rgba(34, 197, 94, 0.15);
        border: 1px solid rgba(34, 197, 94, 0.35);
        color: #16a34a;
      }
      .test-result.error {
        display: block;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.35);
        color: #dc2626;
      }

      /* 底层 4 键主操作栏 */
      .dock-actions {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      .dock-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 4px;
        border: none;
        border-radius: 8px;
        background: none;
        color: var(--text);
        font-size: 11px;
        cursor: pointer;
      }
      .dock-btn.active,
      .dock-btn.is-playing {
        color: var(--accent);
        font-weight: 600;
      }
      .dock-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    `;
      const lineHeightButtonsHtml = LINE_HEIGHT_PRESETS.map(
        (p) => `<button class="pill-btn" data-line-height="${p.value}">${p.label} (${p.value})</button>`
      ).join("");
      const themeButtonsHtml = THEME_PRESETS.map(
        (t) => `<button class="theme-swatch" data-theme-opt="${t.value}"><span class="swatch-dot" style="background:${t.swatch}"></span><span>${t.label}</span></button>`
      ).join("");
      const root = document.createElement("div");
      root.className = "reader-root";
      root.innerHTML = `
      <div class="status-header">
        <span class="status-title" id="rv-status-title">阅读模式</span>
        <span class="status-progress" id="rv-status-progress">0%</span>
      </div>

      <div class="reader-scroll" id="rv-scroll">
        <article class="reader-article">
          <h1 class="reader-chapter-title" id="rv-article-title"></h1>
          <div class="reader-body" id="rv-article-body"></div>
          <div class="reader-footer-nav">
            <button class="footer-nav-btn" id="rv-footer-prev">上一章</button>
            <button class="footer-nav-btn primary" id="rv-footer-next">下一章</button>
          </div>
        </article>
      </div>

      <button class="relocate-btn" id="rv-relocate">回到朗读处</button>

      <div class="mini-tts-bar" id="rv-mini-bar">
        <div class="mini-controls">
          <button class="mini-btn" id="rv-mini-prev" title="上一句">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="mini-btn primary" id="rv-mini-play" title="播放/暂停">
            <svg width="18" height="18" viewBox="0 0 24 24" id="rv-mini-play-icon">${SVG_PLAY_PATH}</svg>
          </button>
          <button class="mini-btn" id="rv-mini-next" title="下一句">
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
        <span class="mini-progress" id="rv-mini-progress">0 / 0</span>
        <button class="mini-btn" id="rv-mini-menu" title="展开菜单">
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </button>
      </div>

      <div class="top-bar" id="rv-top-bar">
        <button class="bar-text-btn" id="rv-exit">← 退出阅读</button>
        <span class="top-title" id="rv-top-title">阅读模式</span>
        <button class="bar-text-btn accent" id="rv-jump" style="display:none">查看原文</button>
        <button class="bar-text-btn" id="rv-top-worker" title="配置 Worker">⚙️</button>
      </div>

      <div class="bottom-dock" id="rv-bottom-dock">
        <div class="subpanel" id="rv-panel-appearance">
          <div class="setting-row">
            <span class="setting-label">字号</span>
            <div class="btn-group">
              <button class="pill-btn" id="rv-font-dec">A-</button>
              <span class="font-val" id="rv-font-val">18px</span>
              <button class="pill-btn" id="rv-font-inc">A+</button>
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-label">行距</span>
            <div class="btn-group">${lineHeightButtonsHtml}</div>
          </div>
          <div class="setting-row">
            <span class="setting-label">背景</span>
            <div class="btn-group">${themeButtonsHtml}</div>
          </div>
          <div class="setting-row">
            <span class="setting-label">偏好</span>
            <label class="switch-label">
              <input type="checkbox" id="rv-auto-enter" />
              <span>打开小说页自动进入阅读模式</span>
            </label>
          </div>
        </div>

        <div class="subpanel" id="rv-panel-tts">
          <div class="tts-info-row">
            <span id="rv-tts-progress">0 / 0</span>
            <span>双击正文任意句可从该处朗读</span>
          </div>
          <div class="tts-controls-row">
            <button class="tts-btn" id="rv-tts-prev" title="上一句">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button class="tts-btn primary" id="rv-tts-play" title="播放/暂停">
              <svg width="24" height="24" viewBox="0 0 24 24" id="rv-tts-play-icon">${SVG_PLAY_PATH}</svg>
            </button>
            <button class="tts-btn" id="rv-tts-next" title="下一句">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
            <button class="tts-btn" id="rv-tts-stop" title="停止朗读">
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
            </button>
          </div>
          <div class="tts-params-row">
            <button class="pill-btn" id="rv-rate">${config.rate.toFixed(1)}x</button>
            <select class="voice-select" id="rv-voice">${buildVoiceOptionsHtml()}</select>
            <button class="pill-btn" id="rv-open-worker">Worker配置</button>
          </div>
        </div>

        <div class="subpanel" id="rv-panel-worker">
          <div class="field">
            <label>Edge TTS Worker 地址 (URL)</label>
            <input type="text" id="rv-worker-url" placeholder="https://xxx.workers.dev 或 http://localhost:8787" />
          </div>
          <div class="field">
            <label>Worker 鉴权密钥 (Token，默认 dev-secret)</label>
            <input type="text" id="rv-token" placeholder="dev-secret" />
          </div>
          <div class="worker-btn-row">
            <button class="save-btn" id="rv-save-config">保存配置</button>
            <button class="test-btn" id="rv-test-config">测试连接</button>
          </div>
          <div class="test-result" id="rv-test-result"></div>
        </div>

        <div class="dock-actions">
          <button class="dock-btn" id="rv-dock-prev-ch">上一章</button>
          <button class="dock-btn" id="rv-dock-tts">听书</button>
          <button class="dock-btn" id="rv-dock-appearance">设置</button>
          <button class="dock-btn" id="rv-dock-next-ch">下一章</button>
        </div>
      </div>
    `;
      this.shadow.appendChild(style);
      this.shadow.appendChild(root);
      this.rootEl = root;
      this.scrollEl = this.shadow.querySelector("#rv-scroll");
      this.statusTitleEl = this.shadow.querySelector("#rv-status-title");
      this.statusProgressEl = this.shadow.querySelector("#rv-status-progress");
      this.articleTitleEl = this.shadow.querySelector("#rv-article-title");
      this.articleBodyEl = this.shadow.querySelector("#rv-article-body");
      this.footerPrevBtn = this.shadow.querySelector("#rv-footer-prev");
      this.footerNextBtn = this.shadow.querySelector("#rv-footer-next");
      this.relocateBtn = this.shadow.querySelector("#rv-relocate");
      this.miniBarEl = this.shadow.querySelector("#rv-mini-bar");
      this.miniPlayBtn = this.shadow.querySelector("#rv-mini-play");
      this.miniPlayIcon = this.shadow.querySelector("#rv-mini-play-icon");
      this.miniProgressEl = this.shadow.querySelector("#rv-mini-progress");
      this.topBarEl = this.shadow.querySelector("#rv-top-bar");
      this.topTitleEl = this.shadow.querySelector("#rv-top-title");
      this.jumpBtn = this.shadow.querySelector("#rv-jump");
      this.bottomDockEl = this.shadow.querySelector("#rv-bottom-dock");
      this.panelAppearanceEl = this.shadow.querySelector("#rv-panel-appearance");
      this.panelTtsEl = this.shadow.querySelector("#rv-panel-tts");
      this.panelWorkerEl = this.shadow.querySelector("#rv-panel-worker");
      this.fontValEl = this.shadow.querySelector("#rv-font-val");
      this.autoEnterInput = this.shadow.querySelector("#rv-auto-enter");
      this.ttsProgressEl = this.shadow.querySelector("#rv-tts-progress");
      this.ttsPlayBtn = this.shadow.querySelector("#rv-tts-play");
      this.ttsPlayIcon = this.shadow.querySelector("#rv-tts-play-icon");
      this.rateBtn = this.shadow.querySelector("#rv-rate");
      this.voiceSelect = this.shadow.querySelector("#rv-voice");
      this.workerInput = this.shadow.querySelector("#rv-worker-url");
      this.tokenInput = this.shadow.querySelector("#rv-token");
      this.testBtn = this.shadow.querySelector("#rv-test-config");
      this.testResultEl = this.shadow.querySelector("#rv-test-result");
      this.dockPrevChBtn = this.shadow.querySelector("#rv-dock-prev-ch");
      this.dockTtsBtn = this.shadow.querySelector("#rv-dock-tts");
      this.dockAppearanceBtn = this.shadow.querySelector("#rv-dock-appearance");
      this.dockNextChBtn = this.shadow.querySelector("#rv-dock-next-ch");
      this.workerInput.value = config.workerUrl;
      this.tokenInput.value = config.token;
      this.voiceSelect.value = config.voice;
    }
    // ─── 事件绑定 ──────────────────────────────────────────────────────────
    bindEvents() {
      const markUserScroll = () => {
        this.lastUserScrollAt = Date.now();
      };
      this.scrollEl.addEventListener("touchstart", markUserScroll, { passive: true });
      this.scrollEl.addEventListener("wheel", markUserScroll, { passive: true });
      this.scrollEl.addEventListener("scroll", () => {
        if (Date.now() > this.programmaticScrollUntil) {
          this.lastUserScrollAt = Date.now();
        }
        this.updateScrollStatus();
        this.updateRelocateVisibility();
      });
      let downX = 0;
      let downY = 0;
      let pointerMoved = false;
      this.scrollEl.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches.length === 1) {
            downX = e.touches[0].clientX;
            downY = e.touches[0].clientY;
            pointerMoved = false;
          }
        },
        { passive: true }
      );
      this.scrollEl.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches.length === 1) {
            if (Math.hypot(e.touches[0].clientX - downX, e.touches[0].clientY - downY) > 10) {
              pointerMoved = true;
            }
          }
        },
        { passive: true }
      );
      this.scrollEl.addEventListener("mousedown", (e) => {
        downX = e.clientX;
        downY = e.clientY;
        pointerMoved = false;
      });
      this.scrollEl.addEventListener("mousemove", (e) => {
        if (e.buttons && Math.hypot(e.clientX - downX, e.clientY - downY) > 10) {
          pointerMoved = true;
        }
      });
      this.scrollEl.addEventListener("click", (e) => {
        var _a;
        if (pointerMoved) {
          pointerMoved = false;
          return;
        }
        try {
          if ((_a = window.getSelection()) == null ? void 0 : _a.toString().trim()) {
            return;
          }
        } catch {
        }
        const target = e.target;
        if (!target || target.closest(".reader-footer-nav, button, a, input, select")) {
          return;
        }
        if (this.isMenuOpen) {
          this.clearSingleTapTimer();
          this.setMenuOpen(false);
          return;
        }
        const sentenceEl = target.closest(".reader-sentence[data-chunk-index]");
        if (!sentenceEl) {
          this.clearSingleTapTimer();
          this.setMenuOpen(true);
          return;
        }
        const chunkIdx = Number.parseInt(sentenceEl.getAttribute("data-chunk-index") || "", 10);
        if (!Number.isFinite(chunkIdx) || chunkIdx < 0) {
          this.setMenuOpen(true);
          return;
        }
        const now = Date.now();
        if (this.lastTapChunkIdx === chunkIdx && now - this.lastTapAt <= 320) {
          this.clearSingleTapTimer();
          this.events.onSeekSentence(chunkIdx);
          return;
        }
        this.clearSingleTapTimer();
        this.lastTapChunkIdx = chunkIdx;
        this.lastTapAt = now;
        this.singleTapTimer = setTimeout(() => {
          this.singleTapTimer = null;
          this.lastTapChunkIdx = -1;
          if (this.opened && !this.isMenuOpen) {
            this.setMenuOpen(true);
          }
        }, 240);
      });
      this.relocateBtn.addEventListener("click", () => {
        this.lastUserScrollAt = 0;
        const activeEl = this.articleBodyEl.querySelector(
          `.reader-sentence[data-chunk-index="${this.activeChunkIndex}"]`
        );
        if (activeEl) {
          this.scrollToSentenceEl(activeEl);
        }
        this.relocateBtn.classList.remove("visible");
      });
      this.shadow.querySelector("#rv-exit").addEventListener("click", () => {
        this.events.onClose();
      });
      this.jumpBtn.addEventListener("click", () => {
        if (this.currentChapterUrl) {
          this.events.onJumpChapterUrl(this.currentChapterUrl);
        }
      });
      this.shadow.querySelector("#rv-top-worker").addEventListener("click", () => {
        this.setSubpanel(this.activeSubpanel === "worker" ? "none" : "worker");
      });
      this.shadow.querySelector("#rv-mini-prev").addEventListener("click", () => {
        this.events.onPrevSentence();
      });
      this.miniPlayBtn.addEventListener("click", () => {
        this.events.onPlayToggle();
      });
      this.shadow.querySelector("#rv-mini-next").addEventListener("click", () => {
        this.events.onNextSentence();
      });
      this.shadow.querySelector("#rv-mini-menu").addEventListener("click", () => {
        this.setMenuOpen(true, "tts");
      });
      this.shadow.querySelector("#rv-font-dec").addEventListener("click", () => {
        this.updateSettings({ fontSize: Math.max(14, this.settings.fontSize - 2) });
      });
      this.shadow.querySelector("#rv-font-inc").addEventListener("click", () => {
        this.updateSettings({ fontSize: Math.min(28, this.settings.fontSize + 2) });
      });
      this.shadow.querySelectorAll("[data-line-height]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = Number.parseFloat(btn.dataset.lineHeight || "1.85");
          if (Number.isFinite(val)) {
            this.updateSettings({ lineHeight: val });
          }
        });
      });
      this.shadow.querySelectorAll("[data-theme-opt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const theme = btn.dataset.themeOpt;
          if (theme) {
            this.updateSettings({ theme });
          }
        });
      });
      this.autoEnterInput.addEventListener("change", () => {
        this.updateSettings({ autoEnter: this.autoEnterInput.checked });
      });
      this.shadow.querySelector("#rv-tts-prev").addEventListener("click", () => {
        this.events.onPrevSentence();
      });
      this.ttsPlayBtn.addEventListener("click", () => {
        this.events.onPlayToggle();
      });
      this.shadow.querySelector("#rv-tts-next").addEventListener("click", () => {
        this.events.onNextSentence();
      });
      this.shadow.querySelector("#rv-tts-stop").addEventListener("click", () => {
        this.events.onStop();
      });
      this.rateBtn.addEventListener("click", () => {
        this.currentRate = getNextRate(this.currentRate);
        this.rateBtn.textContent = `${this.currentRate.toFixed(1)}x`;
        this.events.onRateChange(this.currentRate);
        this.notifyToast(`语速已切换为 ${this.currentRate.toFixed(1)}x`);
      });
      this.voiceSelect.addEventListener("change", () => {
        this.events.onVoiceChange(this.voiceSelect.value);
        this.notifyToast("音色已更新");
      });
      this.shadow.querySelector("#rv-open-worker").addEventListener("click", () => {
        this.setSubpanel("worker");
      });
      this.shadow.querySelector("#rv-save-config").addEventListener("click", () => {
        const url = this.workerInput.value.trim();
        const token = this.tokenInput.value.trim();
        this.events.onSaveConfig(url, token);
        this.setSubpanel("tts");
      });
      this.testBtn.addEventListener("click", () => {
        void executeConnectionTest({
          urlInput: this.workerInput,
          tokenInput: this.tokenInput,
          testBtn: this.testBtn,
          resultEl: this.testResultEl,
          onTest: (url, token) => this.events.onTestConfig(url, token),
          onEmptyUrl: () => this.notifyToast("请先输入 Worker 地址")
        });
      });
      this.footerPrevBtn.addEventListener("click", () => this.events.onPrevChapter());
      this.footerNextBtn.addEventListener("click", () => this.events.onNextChapter());
      this.dockPrevChBtn.addEventListener("click", () => {
        this.setMenuOpen(false);
        this.events.onPrevChapter();
      });
      this.dockNextChBtn.addEventListener("click", () => {
        this.setMenuOpen(false);
        this.events.onNextChapter();
      });
      this.dockTtsBtn.addEventListener("click", () => {
        this.setSubpanel(this.activeSubpanel === "tts" ? "none" : "tts");
      });
      this.dockAppearanceBtn.addEventListener("click", () => {
        this.setSubpanel(this.activeSubpanel === "appearance" ? "none" : "appearance");
      });
    }
  }
  const HIGHLIGHT_STYLE_ID = "novel-tts-page-highlight-style";
  const HIGHLIGHT_CLASS = "novel-tts-active-mark";
  const USER_SCROLL_PROTECT_MS = 3500;
  const SKIP_ANCESTOR_SELECTOR = "script, style, noscript, textarea, input, select, option, novel-tts-host, novel-tts-reader-host";
  function normalizeForMatch(raw) {
    return raw.replace(/[\u200B-\u200D\uFEFF\s]+/g, "");
  }
  function isSkippableChar(ch) {
    return /[\u200B-\u200D\uFEFF\s]/.test(ch);
  }
  class PageHighlighter {
    constructor() {
      __publicField(this, "container", null);
      __publicField(this, "activeMarks", []);
      __publicField(this, "lastMatchPos", 0);
      __publicField(this, "lastUserScrollAt", 0);
      __publicField(this, "onTouchStart");
      __publicField(this, "onWheel");
      this.onTouchStart = () => {
        this.lastUserScrollAt = Date.now();
      };
      this.onWheel = () => {
        this.lastUserScrollAt = Date.now();
      };
      if (typeof window !== "undefined") {
        window.addEventListener("touchstart", this.onTouchStart, { passive: true });
        window.addEventListener("wheel", this.onWheel, { passive: true });
      }
      this.ensureStyleInjected();
    }
    ensureStyleInjected() {
      if (typeof document === "undefined") return;
      if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
      const target = document.head || document.documentElement;
      if (!target) return;
      const style = document.createElement("style");
      style.id = HIGHLIGHT_STYLE_ID;
      style.textContent = `
      .${HIGHLIGHT_CLASS} {
        background: rgba(56, 189, 248, 0.28) !important;
        color: inherit !important;
        border-radius: 3px !important;
        box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.22) !important;
      }
    `;
      target.appendChild(style);
    }
    setContainer(el) {
      this.clear();
      this.container = el;
      this.lastMatchPos = 0;
    }
    resetPosition() {
      this.clear();
      this.lastMatchPos = 0;
    }
    clear() {
      if (this.activeMarks.length === 0) return;
      const parents = /* @__PURE__ */ new Set();
      for (const mark of this.activeMarks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        parents.add(parent);
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
      }
      this.activeMarks = [];
      parents.forEach((parent) => {
        if (typeof parent.normalize === "function") {
          parent.normalize();
        }
      });
    }
    highlight(sentence) {
      this.clear();
      if (typeof document === "undefined") return false;
      const needle = normalizeForMatch(sentence || "");
      if (!needle) return false;
      const root = this.container || document.body || document.documentElement;
      if (!root) return false;
      this.ensureStyleInjected();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const chars = [];
      const charMap = [];
      let currentNode = walker.nextNode();
      while (currentNode) {
        const textNode = currentNode;
        const parentEl = textNode.parentElement;
        if (!parentEl || !parentEl.closest(SKIP_ANCESTOR_SELECTOR)) {
          const val = textNode.nodeValue || "";
          for (let i = 0; i < val.length; i++) {
            const ch = val[i];
            if (!isSkippableChar(ch)) {
              chars.push(ch);
              charMap.push({ node: textNode, offset: i });
            }
          }
        }
        currentNode = walker.nextNode();
      }
      if (chars.length === 0) return false;
      const haystack = chars.join("");
      const searchStart = Math.max(0, this.lastMatchPos);
      let matchIdx = haystack.indexOf(needle, searchStart);
      let matchLen = needle.length;
      if (matchIdx === -1) {
        matchIdx = haystack.indexOf(needle);
      }
      if (matchIdx === -1 && needle.length > 16) {
        const anchor = needle.slice(0, 16);
        matchIdx = haystack.indexOf(anchor, searchStart);
        if (matchIdx === -1) {
          matchIdx = haystack.indexOf(anchor);
        }
        if (matchIdx !== -1) {
          matchLen = anchor.length;
        }
      }
      if (matchIdx === -1) {
        return false;
      }
      const endPos = matchIdx + matchLen;
      this.lastMatchPos = endPos;
      const rangesByNode = /* @__PURE__ */ new Map();
      for (let i = matchIdx; i < endPos; i++) {
        const mapping = charMap[i];
        const existing = rangesByNode.get(mapping.node);
        if (!existing) {
          rangesByNode.set(mapping.node, { start: mapping.offset, end: mapping.offset + 1 });
        } else {
          existing.end = Math.max(existing.end, mapping.offset + 1);
        }
      }
      const entries = Array.from(rangesByNode.entries());
      const wrappedMarks = [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const [textNode, range] = entries[i];
        if (!textNode.parentNode) continue;
        let targetNode = textNode;
        if (range.start > 0) {
          targetNode = textNode.splitText(range.start);
        }
        const spanLen = range.end - range.start;
        if (spanLen < targetNode.data.length) {
          targetNode.splitText(spanLen);
        }
        const mark = document.createElement("mark");
        mark.className = HIGHLIGHT_CLASS;
        targetNode.parentNode.insertBefore(mark, targetNode);
        mark.appendChild(targetNode);
        wrappedMarks.push(mark);
      }
      this.activeMarks = wrappedMarks.reverse();
      if (this.activeMarks.length > 0 && Date.now() - this.lastUserScrollAt > USER_SCROLL_PROTECT_MS) {
        this.scrollIntoViewSafe(this.activeMarks[0]);
      }
      return this.activeMarks.length > 0;
    }
    scrollIntoViewSafe(el) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        try {
          el.scrollIntoView();
        } catch {
        }
      }
    }
    destroy() {
      this.clear();
      if (typeof window !== "undefined") {
        window.removeEventListener("touchstart", this.onTouchStart);
        window.removeEventListener("wheel", this.onWheel);
      }
      if (typeof document !== "undefined") {
        const styleEl = document.getElementById(HIGHLIGHT_STYLE_ID);
        if (styleEl && styleEl.parentNode) {
          styleEl.parentNode.removeChild(styleEl);
        }
      }
    }
  }
  function countEffectiveChars(paragraphs) {
    return paragraphs.reduce((sum, p) => sum + p.replace(/\s+/g, "").length, 0);
  }
  function initNovelTTS() {
    if (typeof window !== "undefined" && window.self !== window.top) {
      return;
    }
    const config = ConfigStorage.load();
    const workerProvider = new EdgeWorkerTTSProvider({
      workerUrl: config.workerUrl || "",
      token: config.token || "dev-secret"
    });
    const initialPageUrl = window.location.href;
    const chapterLoader = new ChapterLoader(initialPageUrl);
    const pageHighlighter = new PageHighlighter();
    let currentChapter = null;
    let currentChunks = [];
    let currentChapterUrl = initialPageUrl;
    let activeChunkIndex = -1;
    let lastSeenHref = initialPageUrl;
    let isChapterLoading = false;
    let bar;
    let readerView;
    const isPlayerActive = () => {
      const state = player.getState();
      return state === "playing" || state === "loading" || state === "paused";
    };
    const player = new NovelPlayer({
      provider: workerProvider,
      voice: config.voice,
      rate: config.rate,
      events: {
        onStateChange: (state) => {
          bar.updatePlayerState(state);
          readerView.updatePlayerState(state);
          if (state === "idle" && !isChapterLoading) {
            activeChunkIndex = -1;
            pageHighlighter.clear();
            readerView.setActiveChunk(-1);
          }
        },
        onIndexChange: (idx, total, text) => {
          activeChunkIndex = idx;
          bar.updateProgress(idx, total, text);
          readerView.updateProgress(idx, total);
          readerView.setActiveChunk(idx);
          if (!readerView.isOpen() && currentChapterUrl === initialPageUrl) {
            pageHighlighter.highlight(text);
          }
        },
        onToast: (msg) => {
          bar.showToast(msg);
        },
        onChapterEnd: () => {
          void handleLoadChapter("next", { isManual: false, autoPlay: true });
        }
      }
    });
    const ensureCurrentChapterParsed = (silent = false) => {
      const href = window.location.href;
      if (!currentChapter || currentChapter.paragraphs.length === 0 || lastSeenHref !== href) {
        if (!silent) {
          bar.showToast("正在解析小说正文…");
        }
        const extracted = extractChapterContent(document, href);
        lastSeenHref = href;
        if (!extracted || extracted.paragraphs.length === 0) {
          currentChapter = null;
          currentChunks = [];
          return null;
        }
        currentChapter = extracted;
        currentChapterUrl = href;
        currentChunks = chunkParagraphs(extracted.paragraphs);
        chapterLoader.markVisited(href);
        pageHighlighter.setContainer(findContentElement(document));
        bar.updateChapter(extracted.title);
      }
      return currentChapter;
    };
    const openReader = () => {
      const chapter = ensureCurrentChapterParsed(true);
      if (!chapter || currentChunks.length === 0) {
        bar.showToast("未识别到小说正文，无法开启阅读模式");
        return;
      }
      pageHighlighter.clear();
      const isCrossChapter = currentChapterUrl !== initialPageUrl;
      readerView.renderChapter(
        chapter,
        currentChunks,
        isCrossChapter ? currentChapterUrl : void 0
      );
      readerView.updatePlayerState(player.getState());
      readerView.updateProgress(
        activeChunkIndex >= 0 ? activeChunkIndex : -1,
        currentChunks.length
      );
      const latestCfg = ConfigStorage.load();
      readerView.syncRate(latestCfg.rate);
      readerView.syncVoice(latestCfg.voice);
      readerView.syncConfigInputs(latestCfg.workerUrl, latestCfg.token);
      readerView.applySettings(latestCfg.reader);
      bar.setSuppressed(true);
      readerView.open();
      if (activeChunkIndex >= 0 && isPlayerActive()) {
        readerView.setActiveChunk(activeChunkIndex);
      }
    };
    const closeReader = () => {
      readerView.close();
      bar.setSuppressed(false);
      if (isPlayerActive() && activeChunkIndex >= 0 && currentChapterUrl === initialPageUrl) {
        const sentence = player.getSentences()[activeChunkIndex];
        if (sentence) {
          pageHighlighter.highlight(sentence);
        }
      }
    };
    const handlePlayToggle = async () => {
      if (isChapterLoading) {
        bar.showToast("正在加载章节，请稍候…");
        return;
      }
      const state = player.getState();
      if (state === "playing" || state === "loading") {
        player.pause();
        return;
      }
      if (state === "paused") {
        if (!player.isFallbackMode()) {
          player.unlockAllAudio({ audio: true, speech: false });
        }
        player.resume();
        return;
      }
      const currentCfg = ConfigStorage.load();
      const hasWorker = Boolean(currentCfg.workerUrl.trim());
      if (hasWorker) {
        player.unlockAllAudio({ audio: true, speech: true });
      } else {
        player.switchToFallback("未配置 Worker，已自动使用系统语音朗读（可点齿轮配置）");
      }
      try {
        const chapter = ensureCurrentChapterParsed(readerView.isOpen());
        if (!chapter) {
          bar.showToast("未识别到小说正文，无法播放");
          return;
        }
        if (!readerView.isOpen() && currentChapterUrl === initialPageUrl) {
          pageHighlighter.setContainer(findContentElement(document));
        }
        await player.playChapter(chapter);
      } catch (err) {
        console.error("[NovelTTS] Play error:", err);
        bar.showToast(`播放失败: ${(err == null ? void 0 : err.message) || err}`);
      }
    };
    const handleSeekSentence = (chunkIndex) => {
      if (isChapterLoading) {
        bar.showToast("正在加载章节，请稍候…");
        return;
      }
      const currentCfg = ConfigStorage.load();
      const hasWorker = Boolean(currentCfg.workerUrl.trim());
      if (hasWorker) {
        player.unlockAllAudio({ audio: true, speech: true });
      } else if (!player.isFallbackMode()) {
        player.switchToFallback("未配置 Worker，已自动使用系统语音朗读");
      }
      const chapter = ensureCurrentChapterParsed(true);
      if (!chapter || currentChunks.length === 0) {
        bar.showToast("未识别到小说正文，无法播放");
        return;
      }
      const safeIndex = Math.max(0, Math.min(chunkIndex, currentChunks.length - 1));
      bar.showToast(`从第 ${safeIndex + 1} 句开始朗读`);
      if (player.getState() === "idle" || player.getSentences().length === 0) {
        void player.playChapter(chapter, safeIndex);
      } else {
        player.seek(safeIndex);
      }
    };
    const handleLoadChapter = async (direction, options) => {
      if (options.isManual && options.autoPlay) {
        player.unlockAllAudio({ audio: true, speech: true });
      }
      if (isChapterLoading) return;
      let targetUrl = null;
      if (direction === "next") {
        targetUrl = (currentChapter == null ? void 0 : currentChapter.nextChapterUrl) || extractNextChapterUrl(document, window.location.href);
      } else {
        targetUrl = (currentChapter == null ? void 0 : currentChapter.prevChapterUrl) || extractPrevChapterUrl(document, window.location.href);
      }
      if (!targetUrl) {
        bar.showToast(direction === "prev" ? "已是第一章" : "已播放至最后一章");
        return;
      }
      if (player.getState() !== "idle") {
        player.stop();
      }
      isChapterLoading = true;
      readerView.setChapterLoading(true);
      bar.showToast(direction === "prev" ? "正在加载上一章…" : "正在加载下一章…");
      try {
        const loaded = await chapterLoader.loadChapter(targetUrl, {
          allowVisited: options.isManual
        });
        if (!loaded || loaded.paragraphs.length === 0) {
          throw new Error("章节正文提取失败或已到达边界");
        }
        currentChapter = loaded;
        currentChapterUrl = targetUrl;
        currentChunks = chunkParagraphs(loaded.paragraphs);
        activeChunkIndex = -1;
        pageHighlighter.resetPosition();
        const isCrossChapter = targetUrl !== initialPageUrl;
        bar.updateChapter(loaded.title, isCrossChapter ? targetUrl : void 0);
        readerView.renderChapter(
          loaded,
          currentChunks,
          isCrossChapter ? targetUrl : void 0
        );
        try {
          window.history.replaceState(null, "", targetUrl);
          document.title = loaded.title;
        } catch {
        }
        lastSeenHref = window.location.href;
        if (options.autoPlay) {
          bar.showToast(`已开始播放：${loaded.title}`);
          if (!ConfigStorage.load().workerUrl.trim()) {
            player.switchToFallback();
          }
          await player.playChapter(loaded);
        } else {
          bar.updateProgress(-1, currentChunks.length);
          readerView.updateProgress(-1, currentChunks.length);
          bar.showToast(`已加载：${loaded.title}`);
        }
      } catch (err) {
        console.warn("[NovelTTS] Failed to load chapter silently:", err);
        if (options.isManual) {
          bar.showToast("静默加载受限，正在直接跳转章节…");
          setTimeout(() => {
            window.location.href = targetUrl;
          }, 300);
        } else {
          bar.showToast(`下一章自动加载失败 (${(err == null ? void 0 : err.message) || err})，可点下一章直接跳转`);
        }
      } finally {
        isChapterLoading = false;
        readerView.setChapterLoading(false);
      }
    };
    const handleRateChange = (rate) => {
      player.setRate(rate);
      ConfigStorage.save({ rate });
      bar.syncRate(rate);
      readerView.syncRate(rate);
    };
    const handleVoiceChange = (voice) => {
      player.setVoice(voice);
      ConfigStorage.save({ voice });
      bar.syncVoice(voice);
      readerView.syncVoice(voice);
    };
    const handleSaveConfig = (workerUrl, token) => {
      const trimmedUrl = workerUrl.trim();
      const effectiveToken = token.trim() || "dev-secret";
      ConfigStorage.save({ workerUrl: trimmedUrl, token: effectiveToken });
      bar.syncConfigInputs(trimmedUrl, effectiveToken);
      readerView.syncConfigInputs(trimmedUrl, effectiveToken);
      if (trimmedUrl) {
        workerProvider.updateConfig(trimmedUrl, effectiveToken);
        player.setProvider(workerProvider);
        bar.showToast("配置已保存并生效");
      } else {
        workerProvider.updateConfig("", effectiveToken);
        player.switchToFallback("已清空 Worker 地址，将使用系统语音朗读");
      }
    };
    const handleTestConfig = async (workerUrl, token) => {
      const effectiveToken = token.trim() || "dev-secret";
      return await workerProvider.testConnection(workerUrl, effectiveToken);
    };
    bar = new FloatingBar(config, {
      onPlayToggle: () => {
        void handlePlayToggle();
      },
      onNextSentence: () => player.nextSentence(),
      onPrevSentence: () => player.previousSentence(),
      onNextChapter: () => {
        void handleLoadChapter("next", { isManual: true, autoPlay: true });
      },
      onOpenReader: openReader,
      onRateChange: handleRateChange,
      onVoiceChange: handleVoiceChange,
      onSaveConfig: handleSaveConfig,
      onTestConfig: handleTestConfig,
      onJumpChapterUrl: (url) => {
        window.location.href = url;
      },
      onBallPositionChange: (pos) => {
        ConfigStorage.save({ ballPosition: pos });
      }
    });
    readerView = new ReaderView(config, {
      onClose: closeReader,
      onPlayToggle: () => {
        void handlePlayToggle();
      },
      onStop: () => player.stop(),
      onPrevSentence: () => player.previousSentence(),
      onNextSentence: () => player.nextSentence(),
      onSeekSentence: handleSeekSentence,
      onPrevChapter: () => {
        void handleLoadChapter("prev", { isManual: true, autoPlay: isPlayerActive() });
      },
      onNextChapter: () => {
        void handleLoadChapter("next", { isManual: true, autoPlay: isPlayerActive() });
      },
      onRateChange: handleRateChange,
      onVoiceChange: handleVoiceChange,
      onSaveConfig: handleSaveConfig,
      onTestConfig: handleTestConfig,
      onJumpChapterUrl: (url) => {
        window.location.href = url;
      },
      onSettingsChange: (patch) => {
        ConfigStorage.saveReaderSettings(patch);
      },
      onToast: (msg) => bar.showToast(msg)
    });
    const tryAutoEnterReader = () => {
      if (!ConfigStorage.load().reader.autoEnter || readerView.isOpen()) {
        return;
      }
      const chapter = ensureCurrentChapterParsed(true);
      if (chapter && chapter.paragraphs.length >= 2 && countEffectiveChars(chapter.paragraphs) >= 200) {
        openReader();
      }
    };
    const mountUI = () => {
      const parent = document.documentElement || document.body;
      bar.mount(parent);
      readerView.mount(parent);
      tryAutoEnterReader();
    };
    if (document.readyState === "loading") {
      bar.mount(document.documentElement || document.body);
      window.addEventListener("DOMContentLoaded", mountUI, { once: true });
    } else {
      mountUI();
    }
    if (typeof GM_registerMenuCommand === "function") {
      try {
        GM_registerMenuCommand("显示/隐藏听书悬浮球", () => {
          if (readerView.isOpen()) {
            closeReader();
          }
          bar.toggleVisible();
        });
        GM_registerMenuCommand("开启/关闭阅读模式", () => {
          if (readerView.isOpen()) {
            closeReader();
          } else {
            openReader();
          }
        });
      } catch {
      }
    }
  }
  initNovelTTS();

})();