set :branch,     'master' unless exists?(:branch)
set :ports,      [9001, 9002, 9003, 9004, 9005, 9006]

#server 'stagepaddie-001.sjc1.yammer.com', :faddie
server 'stagepaddie-002.sjc1.yammer.com', :paddie

