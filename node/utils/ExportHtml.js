/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var async = require("async");
var Changeset = require("./Changeset");
var padManager = require("../db/PadManager");

function getPadPlainText(pad, revNum)
{
  var atext = ((revNum !== undefined) ? pad.getInternalRevisionAText(revNum) : pad.atext());
  var textLines = atext.text.slice(0, -1).split('\n');
  var attribLines = Changeset.splitAttributionLines(atext.attribs, atext.text);
  var apool = pad.pool();

  var pieces = [];
  for (var i = 0; i < textLines.length; i++)
  {
    var line = _analyzeLine(textLines[i], attribLines[i], apool);
    if (line.listLevel)
    {
      var numSpaces = line.listLevel * 2 - 1;
      var bullet = '*';
      pieces.push(new Array(numSpaces + 1).join(' '), bullet, ' ', line.text, '\n');
    }
    else
    {
      pieces.push(line.text, '\n');
    }
  }

  return pieces.join('');
}

function getPadHTML(pad, revNum, callback)
{
  var atext = pad.atext;
  var html;
  async.waterfall([
  // fetch revision atext


  function (callback)
  {
    if (revNum != undefined)
    {
      pad.getInternalRevisionAText(revNum, function (err, revisionAtext)
      {
        atext = revisionAtext;
        callback(err);
      });
    }
    else
    {
      callback(null);
    }
  },

  // convert atext to html


  function (callback)
  {
    html = getHTMLFromAtext(pad, atext);
    callback(null);
  }],
  // run final callback


  function (err)
  {
    callback(err, html);
  });
}

function getHTMLFromAtext(pad, atext)
{
  var apool = pad.apool();
  var textLines = atext.text.slice(0, -1).split('\n');
  var attribLines = Changeset.splitAttributionLines(atext.attribs, atext.text);

  var tags = ['strong', 'em', 'u', 's'];
  var props = ['bold', 'italic', 'underline', 'strikethrough'];
  var anumMap = {};

  props.forEach(function (propName, i)
  {
    var propTrueNum = apool.putAttrib([propName, true], true);
    if (propTrueNum >= 0)
    {
      anumMap[propTrueNum] = i;
    }
  });

  function getLineHTML(text, attribs)
  {
    var propVals = [false, false, false];
    var ENTER = 1;
    var STAY = 2;
    var LEAVE = 0;

    // Use order of tags (b/i/u) as order of nesting, for simplicity
    // and decent nesting.  For example,
    // <b>Just bold<b> <b><i>Bold and italics</i></b> <i>Just italics</i>
    // becomes
    // <b>Just bold <i>Bold and italics</i></b> <i>Just italics</i>
    var taker = Changeset.stringIterator(text);
    var assem = Changeset.stringAssembler();

    function emitOpenTag(i)
    {
      assem.append('<');
      assem.append(tags[i]);
      assem.append('>');
    }

    function emitCloseTag(i)
    {
      assem.append('</');
      assem.append(tags[i]);
      assem.append('>');
    }

    function emitOpenURL(url) {
      assem.append('<a href="' + _escapeHTML(url) + '" target="_blank">');
    }

    function emitCloseURL() {
      assem.append('</a>');      
    }

    var urls = _findURLs(text);
    var mphs = []; //_findModelPlaceholders(text);
    var regexAttrs = (function() {
      var attrs = [];
      var args = Array.prototype.slice.call(arguments);
      args.forEach(function(l) {
        if(l && l.length) {
          attrs = attrs.concat(l);
        }
      });
      attrs = attrs.sort(function(a, b) {
        return a[0] <= b[0] ? -1 : 1;
      });

      return attrs;
    })(urls, mphs);

    var idx = 0;

    function processNextChars(numChars)
    {
      if (numChars <= 0)
      {
        return;
      }

      var iter = Changeset.opIterator(Changeset.subattribution(attribs, idx, idx + numChars));
      idx += numChars;

      while (iter.hasNext())
      {
        // url is atomic, should only occur once per operation
        var url, yammerRef;
        var o = iter.next();
        var propChanged = false;
        Changeset.eachAttribNumber(o.attribs, function (a)
        {
          if (a in anumMap)
          {
            var i = anumMap[a]; // i = 0 => bold, etc.
            if (!propVals[i])
            {
              propVals[i] = ENTER;
              propChanged = true;
            }
            else
            {
              propVals[i] = STAY;
            }
          }
          var attr = apool.numToAttrib[a];

          // FIXME: Small hack for the case where yammer attribute
          // value gets combined into the key
          var match = attr[0].match(/(yammer):(\[[a-zA-Z]+:\d+\])/);
          if(match) {
            attr = [ match[1], match[2] ];
          }


          if(attr && attr[1]) {
            switch(attr[0]) {
              case 'url':
                url = attr[1];
                break;
              case 'yammer':
                yammerRef = attr[1];
                break;
              default:
                break;
            }
          }
        });
        for (var i = 0; i < propVals.length; i++)
        {
          if (propVals[i] === true)
          {
            propVals[i] = LEAVE;
            propChanged = true;
          }
          else if (propVals[i] === STAY)
          {
            propVals[i] = true; // set it back
          }
        }
        // now each member of propVal is in {false,LEAVE,ENTER,true}
        // according to what happens at start of span
        if (propChanged)
        {
          // leaving bold (e.g.) also leaves italics, etc.
          var left = false;
          for (var i = 0; i < propVals.length; i++)
          {
            var v = propVals[i];
            if (!left)
            {
              if (v === LEAVE)
              {
                left = true;
              }
            }
            else
            {
              if (v === true)
              {
                propVals[i] = STAY; // tag will be closed and re-opened
              }
            }
          }

          for (var i = propVals.length - 1; i >= 0; i--)
          {
            if (propVals[i] === LEAVE)
            {
              emitCloseTag(i);
              propVals[i] = false;
            }
            else if (propVals[i] === STAY)
            {
              emitCloseTag(i);
            }
          }
          for (var i = 0; i < propVals.length; i++)
          {
            if (propVals[i] === ENTER || propVals[i] === STAY)
            {
              emitOpenTag(i);
              propVals[i] = true;
            }
          }
          // propVals is now all {true,false} again
        } // end if (propChanged)
        var chars = o.chars;
        if (o.lines)
        {
          chars--; // exclude newline at end of line, if present
        }
        var s = taker.take(chars);

        if(url && _urlIsSafe(url)) { emitOpenURL(url); }
        if(yammerRef) { assem.append('<span class="yj-page-model-placeholder">'); }

        if(yammerRef) {
          assem.append(_escapeHTML(yammerRef));
        } else {
          assem.append(_escapeHTML(s));
        }

        if(yammerRef) { assem.append('</span>'); }
        if(url && _urlIsSafe(url)) { emitCloseURL(); }

        // reset url for next iteration
        url = null;
        yammerRef = null;
      } // end iteration over spans in line
      for (var i = propVals.length - 1; i >= 0; i--)
      {
        if (propVals[i])
        {
          emitCloseTag(i);
          propVals[i] = false;
        }
      }
    } // end processNextChars

    regexAttrs.forEach(function (match)
    {
      var filter = match[3];
      filter(match, assem, idx, processNextChars);
    });

    processNextChars(text.length - idx);

    return _processSpaces(assem.toString());
  } // end getLineHTML
  var pieces = [];

  // Need to deal with constraints imposed on HTML lists; can
  // only gain one level of nesting at once, can't change type
  // mid-list, etc.
  // People might use weird indenting, e.g. skip a level,
  // so we want to do something reasonable there.  We also
  // want to deal gracefully with blank lines.
  var lists = []; // e.g. [[1,'bullet'], [3,'bullet'], ...]
  for (var i = 0; i < textLines.length; i++)
  {
    var line = _analyzeLine(textLines[i], attribLines[i], apool);
    var lineContent = getLineHTML(line.text, line.aline);

    if (line.listLevel || lists.length > 0)
    {
      // do list stuff
      var whichList = -1; // index into lists or -1
      if (line.listLevel)
      {
        whichList = lists.length;
        for (var j = lists.length - 1; j >= 0; j--)
        {
          if (line.listLevel <= lists[j][0])
          {
            whichList = j;
          }
        }
      }

      if (whichList >= lists.length)
      {
        lists.push([line.listLevel, line.listTypeName]);
        pieces.push('<ul><li>', lineContent || '<br>');
      }
      else if (whichList == -1)
      {
        if (line.text)
        {
          // non-blank line, end all lists
          pieces.push(new Array(lists.length + 1).join('</li></ul\n>'));
          lists.length = 0;
          pieces.push(lineContent, '<br>');
        }
        else
        {
          pieces.push('<br><br>');
        }
      }
      else
      {
        while (whichList < lists.length - 1)
        {
          pieces.push('</li></ul>');
          lists.length--;
        }
        pieces.push('</li><li>', lineContent || '<br>');
      }
    }
    else if(line.headerType) {
      pieces.push('<h' + line.headerType + '>' + lineContent + '</h' + line.headerType + '>');
    }
    else
    {
      pieces.push(lineContent, '<br>');
    }
  }
  pieces.push(new Array(lists.length + 1).join('</li></ul>'));

  return pieces.join('');
}

function _analyzeLine(text, aline, apool)
{
  var line = {};

  // identify list
  var lineMarker = 0;
  line.listLevel = 0;
  if (aline)
  {
    var opIter = Changeset.opIterator(aline);
    var op;
    if (opIter.hasNext())
    {
      op = opIter.next();
      var listType = Changeset.opAttributeValue(op, 'list', apool);
      if (listType)
      {
        lineMarker = 1;
        listType = /([a-z]+)([12345678])/.exec(listType);
        if (listType)
        {
          line.listTypeName = listType[1];
          line.listLevel = Number(listType[2]);
        }
      }

      var headerType = Changeset.opAttributeValue(op, 'heading', apool);
      headerType = headerType ? parseInt(headerType, 10) : '';
      if(headerType && headerType > 0)
      {
        line.headerType = headerType;
      }
    }
  }
  if (lineMarker)
  {
    line.text = text.substring(1);
    line.aline = Changeset.subattribution(aline, 1);
  }
  else
  {
    line.text = text;
    line.aline = aline;
  }

  return line;
}

exports.getPadHTMLDocument = function (padId, revNum, opts, callback)
{
  if(typeof opts === 'boolean') {
    opts = {noDocType:opts};
  } else {
    opts = opts || {}    
  }
  if(opts.noDocType === undefined) {
    opts.noDocType = true;
  }
  if(opts.full === undefined) {
    opts.full = true;
  }

  padManager.getPad(padId, function (err, pad)
  {
    var head = '',
        foot = '';

    if (err)
    {
      callback(err);
      return;
    }

    if(opts.full) {
      var head = (opts.noDocType ? '' : '<!doctype html>\n') + '<html lang="en">\n' + (opts.noDocType ? '' : '<head>\n' + '<meta charset="utf-8">\n' + '<style> * { font-family: arial, sans-serif;\n' + 'font-size: 13px;\n' + 'line-height: 17px; }</style>\n' + '</head>\n') + '<body>';

      var foot = '</body>\n</html>\n';
    }

    getPadHTML(pad, revNum, function (err, html)
    {
      callback(err, head + html + foot);
    });
  });
}

var _urlIsSafe = function (url) {
  // Whitelist http, https #security
  return typeof url == 'string' && url.match(/^(?:https?:\/\/)/i);
};
function _escapeHTML(s)
{
  var re = /[&<>"]/g;
  if (!re.MAP)
  {
    // persisted across function calls!
    re.MAP = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    };
  }
  
  s = s.replace(re, function (c)
  {
    return re.MAP[c];
  });
  
  return s.replace(/[^\x21-\x7E\s\t\n\r]/g, function(c)
  {
    return "&#" +c.charCodeAt(0) + ";"
  });
}

// copied from ACE


function _processSpaces(s)
{
  var doesWrap = true;
  if (s.indexOf("<") < 0 && !doesWrap)
  {
    // short-cut
    return s.replace(/ /g, '&nbsp;');
  }
  var parts = [];
  s.replace(/<[^>]*>?| |[^ <]+/g, function (m)
  {
    parts.push(m);
  });
  if (doesWrap)
  {
    var endOfLine = true;
    var beforeSpace = false;
    // last space in a run is normal, others are nbsp,
    // end of line is nbsp
    for (var i = parts.length - 1; i >= 0; i--)
    {
      var p = parts[i];
      if (p == " ")
      {
        if (endOfLine || beforeSpace) parts[i] = '&nbsp;';
        endOfLine = false;
        beforeSpace = true;
      }
      else if (p.charAt(0) != "<")
      {
        endOfLine = false;
        beforeSpace = false;
      }
    }
    // beginning of line is nbsp
    for (var i = 0; i < parts.length; i++)
    {
      var p = parts[i];
      if (p == " ")
      {
        parts[i] = '&nbsp;';
        break;
      }
      else if (p.charAt(0) != "<")
      {
        break;
      }
    }
  }
  else
  {
    for (var i = 0; i < parts.length; i++)
    {
      var p = parts[i];
      if (p == " ")
      {
        parts[i] = '&nbsp;';
      }
    }
  }
  return parts.join('');
}

function _regexFinder(re, type, filter) {
  return function(text) {
    re.lastIndex = 0;
    var matches = null;
    var execResult;
    while ((execResult = re.exec(text)))
    {
      matches = (matches || []);
      var startIndex = execResult.index;
      var m = execResult[0];
      matches.push([startIndex, m, type, filter]);
    }

    return matches;
  }
}

// copied from ACE
var _REGEX_WORDCHAR = /[\u0030-\u0039\u0041-\u005A\u0061-\u007A\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u1FFF\u3040-\u9FFF\uF900-\uFDFF\uFE70-\uFEFE\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFDC]/;
var _REGEX_SPACE = /\s/;
var _REGEX_URLCHAR = new RegExp('(' + /[-:@a-zA-Z0-9_.,~%+\/\\?=&#;()$]/.source + '|' + _REGEX_WORDCHAR.source + ')');
var _REGEX_URL = new RegExp(/(?:(?:https?|s?ftp|ftps|file|smb|afp|nfs|(x-)?man|gopher|txmt):\/\/|mailto:)/.source + _REGEX_URLCHAR.source + '*(?![:.,;])' + _REGEX_URLCHAR.source, 'g');

// returns null if no URLs, or [[startIndex1, url1], [startIndex2, url2], ...]

var _findURLs = _regexFinder(_REGEX_URL, 'url', function(urlData, assem, curIdx, processNextChars) {
  var startIndex = urlData[0];
  var url = urlData[1];
  var urlLength = url.length;
  processNextChars(startIndex - curIdx);
  assem.append('<a href="' + _escapeHTML(url) + '">');
  processNextChars(urlLength);
  assem.append('</a>');
});

// Yammer Model Placeholders
var _REGEX_MPH = /\[\[(\w+):(\d+)\]\]/g;
_findModelPlaceholders = _regexFinder(_REGEX_MPH, 'mph', function(match, assem, curIdx, processNextChars) {
  var startIndex = match[0];
  var mph = match[1];
  var len = mph.length;
  processNextChars(startIndex - curIdx);
  assem.append('<span class="yj-page-model-placeholder">');
  processNextChars(len);
  assem.append('</span>');
});
