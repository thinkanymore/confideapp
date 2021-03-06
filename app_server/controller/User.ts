// import UserModel from "../model/User";
import UserModel from "../model/User";
import { IUser } from "../interface/model/IUser";
import * as Bluebird from "bluebird";
// import {Op} from "sequelize";
import WeixinHelper from "../helper/weixinHelper";
import { ERole } from "../enum/ERole";
import AreaHelper from "../helper/areaHelper";
import ErrorMsg from "../model/ErrorMsg";
import * as Sequelize from "sequelize";
import MailHelper from "../helper/mailHelper";
import { IMailCode } from "../interface/IMailCode";
import { EBindPhoneStatus } from "../enum/EBindPhoneStatus";
import ListenerService from "./Listener";
import ObjectHelper from "../helper/objectHelper";
import { IListener } from "../interface/model/IListener";
import MongoSyncBiz from "../biz/MongoSyncBiz";

export default class UserService {

    private static _instance: UserService;
    private _areaHelper:AreaHelper;
    private _mailHelper:MailHelper;
    private mongoSyncbiz:MongoSyncBiz;

    private constructor(private listenerService?:ListenerService) {
        this._mailHelper = MailHelper.getInstance();
        this._areaHelper = AreaHelper.getInstance();
        this.mongoSyncbiz = MongoSyncBiz.getInstance(); 
    }

    public bindUser(code:string){
        return WeixinHelper.getUserinfoByCode(code).then(res=>{
            const userModel:IUser = {
                weixinid:res.openid,
                role:ERole.Pourouter,
                nickname:res.nickname,
                headimgurl:res.headimgurl,
                address:this._areaHelper.getCode(res.city),
                sex:res.sex
            }
            //查看是否绑定了微信
            return this.findUserByWxid(userModel.weixinid).then((user:any)=>{
                if(user){
                    return Bluebird.resolve(user);
                }
                return this.create(userModel);
            });
        });
    }

    public update(user:IUser,transtion?:Sequelize.Transaction){
        if(!user.id){
            return Bluebird.reject(new ErrorMsg(false,"用户id不能为空"));
        }
        const id = user.id;
        delete user.id;
        let options:Sequelize.UpdateOptions = {
            where:{
                id
            }
        }
        if(transtion){
            options.transaction = transtion;
        }
        return UserModel.update(user,options).then(res=>{
            if(res[0]>0){
                user.id = id;
                return this.mongoSyncbiz.updateByUser(user);
            }
            return res;
        });
    }

    private create(user:IUser){
        return UserModel.create(user);
    }

    public find(id:number){
        return UserModel.findById(id);
    }

    public findInIds(ids:number[]){
        return UserModel.findAll({
            where:{
                id:{
                    [Sequelize.Op.in]:ids
                }
            }
        });
    }

    private findUserByWxid(weixinid:string){
        return UserModel.find({
            where:{
                weixinid:weixinid
            }
        }).then(user=>{
            if(user&&user.role===ERole.Listener){
                if(this.listenerService){
                    return this.listenerService.findByUserid(user.id).then(listener=>{
                        const userTemp:any = ObjectHelper.serialize(user);
                        userTemp.listener = ObjectHelper.serialize<IListener>(listener);
                        userTemp.pricesettings = userTemp.listener.user.pricesettings;
                        delete userTemp.listener.user;
                        return userTemp;
                    });
                }
            }
            return user;
        });
    }

    public findByWeixin(weixinid:string){
        if(!weixinid){
            return Bluebird.reject({message:"微信id不能为空"});
        }
        return this.findUserByWxid(weixinid).then(user=>{
            if(!user){
                return Bluebird.reject(new ErrorMsg(false,"未找到对应用户"));
            }
            return user;
        });
    }

    /**
     * findByUserid 根据用户id查找
     */
    public findByUserid(userid:number) {
        if(!userid){
            return Bluebird.reject({message:"用户id不能为空"});
        }
        return UserModel.find({
            where:{
                id:userid
            }
        }).then(user=>{
            if(!user){
                return Bluebird.reject(new ErrorMsg(false,"未找到对应用户"));
            }
            if(user.role===ERole.Listener&&this.listenerService){
                return this.listenerService.findByUserid(user.id).then(listener=>{
                    const userTemp:any = ObjectHelper.serialize(user);
                    userTemp.listener = ObjectHelper.serialize<IListener>(listener);
                    userTemp.pricesettings = userTemp.listener.user.pricesettings;
                    delete userTemp.listener.user;
                    return userTemp;
                });
            }
            return user;
        });
    }

    public delete(id:number){
        return UserModel.update({
            status:-1
        },{
            where:{
                id:id
            }
        });
    }

    public deleteByWeixin(weixinid:string){
        if(!weixinid){
            return Promise.reject({message:"微信id不能为空"});
        }
        return UserModel.update({
            status:-1
        },{
            where:{
                weixinid:weixinid
            }
        });
    }

    private findByPhone(phone:string){
        return UserModel.find({
            where:{
                phone:phone
            }
        });
    }

    public getCheckCode(phone:string){
        return this.findByPhone(phone).then(res=>{
            if(res){
                return Bluebird.reject(new ErrorMsg(false,"当前手机号已经绑定账号"));
            }            
            return this._mailHelper.getCode(phone);
        })
    }

    public bindPhoneCode(source:IMailCode,checkModel:IMailCode,userid:number){
        
        const result = this._mailHelper.checkCode(source,checkModel);
        if(!result.success){
            return Bluebird.reject(result);
        }
        return this.findByPhone(checkModel.phone).then(res=>{
            if(res){
                return Bluebird.reject(new ErrorMsg(false,"当前手机号已经绑定账号"));
            }
            return this.update({
                phone:checkModel.phone,
                phonebindstatus:EBindPhoneStatus.已绑定,
                id:userid
            });
        })
    }

    static createInstance(listenerService?:ListenerService) {
        UserService.getInstance(listenerService);
    }

    static getInstance(listenerService?:ListenerService) {
        return this._instance || (this._instance = new this(listenerService));
    }

}