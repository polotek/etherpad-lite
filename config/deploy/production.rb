set :branch,     'master' unless exists?(:branch)
set :ports,      (9001..9012).map

server 'paddie-001.sjc1.yammer.com', :paddie
server 'paddie-002.sjc1.yammer.com', :paddie
server 'paddie-003.sjc1.yammer.com', :paddie

