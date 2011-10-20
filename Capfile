set :stages,        %w(staging production)
set :default_stage, 'staging'
require 'capistrano/ext/multistage'
require 'pp'
require 'fileutils'
require 'railsless-deploy' 

set :application,   'paddie'
set :owner,         'paddie'
set :owner_group,   'eng'
set :deploy_to,     "/opt/#{application}"
set :deploy_via,    :remote_cache
set :scm,           :git
set :scm_verbose,   true
set :repository,    'git@github.com:yammer/etherpad-lite.git'


ssh_options[:forward_agent] = true

namespace :deploy do
  task :default do
    transaction do
      update
      restart
    end
  end

  task :setup_fix_permissions do
    sudo "mkdir -p #{deploy_to}"
    sudo "chown -R #{owner}:#{owner_group} #{deploy_to}"
  end
  after "deploy:setup", "deploy:setup_fix_permissions"

  task :update_code_fix_permissions do
    sudo "chown -R #{owner}:#{owner_group} #{current_release}"
    sudo "chown -R #{owner}:#{owner_group} #{shared_path}"
    sudo "chmod -R g+w #{shared_path}"
  end 
  after "deploy:update_code", "deploy:update_code_fix_permissions"

  task :update_application_configuration do
    run "cp #{current_release}/settings-#{stage}.json #{current_release}/settings.json"
  end
  after "deploy:update_code", "deploy:update_application_configuration"

  task :start do
    find_servers.sort.each do |server|
      ports.each do |port|
        sudo "start paddie PORT=#{port} ENV=#{stage}", :hosts => [ server ]
      end
    end
  end

  task :stop do 
    find_servers.sort.each do |server|
      logger.info "stopping all paddies on #{server}"
      sudo "initctl emit stop-all-paddies"
    end
  end

  task :update_system_etc do
    sudo "cp #{current_release}/bin/paddie.upstart /etc/init/paddie.conf"
    sudo "cp #{current_release}/config/haproxy/#{stage}.cfg /etc/haproxy/paddie.cfg"
  end
  before "deploy:restart", "deploy:update_system_etc"

  task :restart do
    find_servers.sort.each do |server|
      logger.info "disabling haproxy on #{server}"
      sudo "#{current_release}/bin/haproxyctl disable"
      sudo "initctl emit stop-all-paddies; sleep 1"

      logger.info "resting for ten seconds"
      sleep 10

      logger.info "starting paddie on ports #{ports.first} to #{ports.last}"
      ports.each do |port|
        sudo "start paddie PORT=#{port};"
      end

      ## FIXME: should restart haproxy
      logger.info "restarting haproxy"
      sudo "#{current_release}bin/haproxy_reload.sh paddie"
    end
  end
end
