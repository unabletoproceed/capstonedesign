#!/bin/bash
PING_TARGET="8.8.8.8"      
INTERFACE="wlan0"          
LOG_FILE="/home/serabi/watchdog_log.txt"
ping -c3 $PING_TARGET > /dev/null
if [ $? != 0 ]
then
    echo "$(date): Koneksi PUTUS! Mencoba restart interface $INTERFACE..." >> $LOG_FILE
    /usr/sbin/ip link set $INTERFACE down
    sleep 5
    /usr/sbin/ip link set $INTERFACE up
    sleep 20  
    ping -c3 $PING_TARGET > /dev/null
    if [ $? != 0 ]
    then
        echo "$(date): Restart Wi-Fi GAGAL. Melakukan REBOOT Pi..." >> $LOG_FILE
        /usr/sbin/reboot
    else
        echo "$(date): Koneksi BERHASIL dipulihkan." >> $LOG_FILE
    fi
else
    # echo "$(date): Koneksi AMAN. Watchdog berjalan." >> $LOG_FILE
    exit 0
fi
