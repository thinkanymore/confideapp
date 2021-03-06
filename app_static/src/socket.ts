import ISocketEvent from "./interface/ISocketEvent";
import io from "socket.io-client";

// declare var io:any;
export default class SocketWrapper{
    private socket:SocketIOClient.Socket;
    private static readonly reconnectionAttempts = 10;
    private static readonly chatUrl = "/chat";
    //应该是权限
    constructor(private userid:number,events:ISocketEvent){
        this.init();
        this.initEvent(events);
    }

    private init(){
        this.socket = io(`${SocketWrapper.chatUrl}?uid=${this.userid}`,{
            reconnectionAttempts:SocketWrapper.reconnectionAttempts,
            reconnectionDelay:3000
        });
    }

                 private initEvent(events: ISocketEvent) {
                   for (let key in events) {
                     this.socket.on(key, events[key].bind(this));
                   }
                 }

                 public on(event: string, listener: Function) {
                   return this.socket.on(event, listener);
                 }

                 public remove(event: string, listener?: Function) {
                   return this.socket.removeEventListener(event, listener);
                 }

                 public emit(event: string, args: any, cb?: any) {
                   return this.socket.emit(event, args, cb);
                 }

                 public close() {
                   return this.socket.close();
                 }
               }
