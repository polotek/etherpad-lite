# Deploy for xdr-proxy to EC2.
#
# This is using the railsless-deploy gem, see ../Capfile.

set :branch, 'master' unless exists?(:branch)
set :deploy_via, :remote_cache

role :node, 'paddie@stagepaddie-001'

set :instances, [9001, 9002, 9003]

namespace :deploy do
  task :default do
    transaction do
      update
      npm_update
      restart
    end
  end

  task :start, :roles => :node do
    for port in instances do
      run start_command(port, stage)
    end
    sleep 1
  end

  task :stop, :roles => :node do
    # pkill exits non-zero if there are no matches. We don't care if it was running before.
    run soft_stop_signal_command rescue nil
  end

  task :restart, :roles => :node do
    # Iterate through servers 1x1 and restart them, wait until they
    # can service requests before moving on
    for port in instances do
      run restart_command(port, stage)
    end
  end

  task :npm_update, :except => { :no_npm => true } do
    run "npm update"
  end

  task :npm_rebuild, :except => { :no_npm => true } do
    run "npm rebuild"
  end

end

desc "tail log files"
task :tail_logs, :roles => :node do
  run "tail -f #{current_path}/logs/stdout.log" do |channel, stream, data|
    puts  # for an extra line break before the host name
    puts "#{channel[:host]}: #{data}"
    break if stream == :err
  end
end
