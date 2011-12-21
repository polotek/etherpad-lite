var fu = require('foounit')
  , pth = require('path');

fu.globalize();
fu.mount('src', pth.join(__dirname, '../node'));
fu.mount('spec', pth.join(__dirname, './'));
fu.mount('ueberDB', pth.join(__dirname, '../node_modules/ueberDB'));

fu.require(':spec/ueberDB/cache_spec');
fu.run();
