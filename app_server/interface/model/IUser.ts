export interface IUser{
    id?:number,
    weixinid:string,
    sex?:number,
    birthday?:string,
    address?:string,
    role:number,
    status?:number,
    follow?:string,
    nickname?:string
    headimgurl?:string
}
export default IUser;