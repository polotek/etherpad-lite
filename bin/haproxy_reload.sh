#!/bin/sh

haproxy="/usr/sbin/haproxy"

usage () {
  echo "usage: haproxy_reload.sh [-h] -n NAME"
  echo "  NAME  - the short name of the VIP to reload"
}

die () {
  echo $* 1>&2
  exit 127
}

haproxy_check () {
  $haproxy -f "$cfg_file" -c
  if [ $? != 0 ]; then
    die "errors in configuration: ${cfg_file}!"
  fi
}

haproxy_reload () {
  haproxy_check

  if ! test "$USER" = "root"; then
    die must be root
  fi

  if ! test -r "$pid_file"; then
    die "can't read pid file: '${pid_file}'"
  fi

  pids=$(cat "$pid_file")
  if ! test -n "$pids"; then
    die "no pids in ${pid_file}?"
  fi

  $haproxy -f "$cfg_file" -sf $pids
}

while getopts hn: o; do
  case "$o" in
    n) name="$OPTARG" ;;
    h) usage; exit 1 ;;
    *) usage; die invalid arguments ;;
  esac
done

if ! test -n "$name"; then
  usage
  die missing arguments
fi

cfg_file="/etc/haproxy/${name}.cfg"
pid_file="/var/run/haproxy/${name}.pid"

haproxy_reload
