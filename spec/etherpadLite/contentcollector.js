var fs = require('fs')
  , path = require('path')
  , padManager = foounit.require(':src/db/PadManager')
  , jsdom = require('jsdom').jsdom
  , makeContentCollector = foounit.require(':src/utils/contentcollector').makeContentCollector;

describe('contentcollector', function() {

  var cc, pad;
  before(function() {
    pad = null;

    padManager.getPad('www.yammer.dev-19', function(err, p) {
      if(err) { throw err; }

      pad = p;
      cc = makeContentCollector(true, null, pad.pool);
    });

    waitFor(function() {
      expect(pad).toNot(beNull);
    });
  });

  var htmlDir = 'spec/data/html/'
    , files = fs.readdirSync(htmlDir);
  files.forEach(function(f) {
    it(path.basename(f), function() {
      var html = fs.readFileSync(htmlDir + f) + ''
        , doc = jsdom(html.replace(/>\n+</g, '><'))
        , result = null;

      if(!(doc.childNodes && doc.childNodes.length)) {
        throw new Error('No child nodes');
      }

      cc.collectContent(doc.childNodes[0]);
      result = cc.finish();

      expect(result).toNot(beNull);
    });
  });
});
