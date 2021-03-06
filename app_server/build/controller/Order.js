"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const OrderBiz_1 = require("../biz/OrderBiz");
const User_1 = require("./User");
const ErrorMsg_1 = require("../model/ErrorMsg");
const ERole_1 = require("../enum/ERole");
// import { wxPay, recieve } from "../helper/wxPay";
const wxPayHelper_1 = require("../helper/wxPayHelper");
const EOrderStatus_1 = require("../enum/order/EOrderStatus");
const Order_1 = require("../model/Order");
const EPayType_1 = require("../enum/order/EPayType");
const Sequelize = require("sequelize");
const _ = require("lodash");
const logHelper_1 = require("../helper/logHelper");
// import { getClientIp } from "../helper/util";
const sequelize_1 = require("sequelize");
const moment = require("moment");
const ECompleteType_1 = require("../enum/order/ECompleteType");
const mysqlSeq_1 = require("../mysqlSeq");
const CalucateService_1 = require("../helper/CalucateService");
const User_2 = require("../model/User");
class OrderService {
    constructor() {
        this.logHelper = logHelper_1.LogHelper.getInstance();
        this.wxPayHelper = wxPayHelper_1.default.getInstance();
        this.biz = OrderBiz_1.default.getInstance();
        this.userService = User_1.default.getInstance();
    }
    checkPay(orderModel) {
        const findCurrentUser = this.userService.find(orderModel.uid);
        const findListener = this.userService.find(orderModel.lid);
        return Bluebird.all([findCurrentUser, findListener]).then(datas => {
            if (!datas[0] || !datas[1]) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "用户或倾听者不存在"));
            }
            if (datas[1].role !== ERole_1.ERole.Listener) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "购买对象不是倾听者"));
            }
            const user = datas[0];
            if (orderModel.balance) {
                if (!user.money) {
                    return Bluebird.reject(new ErrorMsg_1.default(false, "用户余额为空"));
                }
                if (user.money < orderModel.balance) {
                    return Bluebird.reject(new ErrorMsg_1.default(false, "用户余额不足"));
                }
            }
            //都是倾听者验证是否存在反向订单，如果有，则还有未完成订单
            if (datas[0].role === ERole_1.ERole.Listener && datas[1].role === ERole_1.ERole.Listener) {
                this.biz.hasOrder(orderModel.lid, orderModel.uid).then(order => {
                    if (order) {
                        return Bluebird.reject(new ErrorMsg_1.default(false, "当前有未完成订单，请查看我的订单"));
                    }
                    return Bluebird.resolve(datas);
                });
            }
            return Bluebird.resolve(datas);
        });
    }
    /**
     * 订单生成
     * @param orderParam
     */
    create(orderParam) {
        const checkResult = this.biz.checkOrder(orderParam);
        if (!checkResult.success) {
            return Bluebird.reject(checkResult);
        }
        const orderModel = {
            ip: orderParam.ip,
            useragent: orderParam.useragent,
            uid: orderParam.uid,
            lid: orderParam.lid,
            payprice: orderParam.payprice,
            totalprice: orderParam.totalprice,
            balance: orderParam.balance || 0,
            source: orderParam.source,
            servicetype: orderParam.servicetype,
            payservicetime: orderParam.payservicetime,
            uprice: orderParam.uprice,
            comment: orderParam.comment,
            ctime: new Date,
            status: EOrderStatus_1.EOrderStatus.Awaiting_Payment,
            paytype: EPayType_1.EPayType.WX //默认微信
        };
        return this.checkPay(orderModel).then(datas => {
            const user = datas[0];
            //启动事务，创建订单和更改余额
            return mysqlSeq_1.default.transaction(tran => {
                const createOrder = Order_1.default.create(orderModel).then(order => {
                    return { user, order };
                });
                const updateUser = this.userService.update({
                    money: CalucateService_1.default.numSub(user.money, orderModel.balance),
                    id: orderModel.uid
                }, tran);
                return Bluebird.all([createOrder, updateUser]);
            });
        }).then(orderModel => {
            const user = orderModel.user;
            const order = orderModel.order;
            return this.wxPayHelper.pay(order.ip, user.weixinid, order.id, order.payprice).then(data => {
                this.logHelper.errorOrder({
                    body: data,
                    message: "支付获取参数成功"
                });
                return {
                    order: order,
                    jsParam: data,
                };
            }, err => {
                this.logHelper.errorOrder({
                    body: err.message,
                    message: "支付获取参数失败"
                });
                return Promise.reject(err);
            });
        });
    }
    /**
     * 订单支付
     * @param orderid
     */
    pay(userid, orderid) {
        return Order_1.default.findById(orderid).then(order => {
            if (!order) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "订单不存在"));
            }
            if (order.uid !== userid) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "用户id与订单用户不一致"));
            }
            return this.checkPay(order).then(orderModel => {
                const user = orderModel[0];
                return this.wxPayHelper.pay(order.ip, user.weixinid, order.id, order.payprice).then(data => {
                    this.logHelper.errorOrder({
                        body: data,
                        orderid: order.id,
                        message: "支付获取参数成功"
                    });
                    return {
                        data: order,
                        jsParam: data,
                    };
                }, err => {
                    this.logHelper.errorOrder({
                        body: err.message,
                        orderid: order.id,
                        message: "支付获取参数失败"
                    });
                    return err;
                });
            });
        });
    }
    /**
     * 验证当前两个用户是否有订单
     * @param uid
     * @param lid
     */
    checkHasOrder(uid, lid) {
        //必须是已支付或服务中的订单
        return Order_1.default.find({
            where: {
                [sequelize_1.Op.or]: [{
                        uid: uid,
                        lid: lid
                    }, {
                        uid: lid,
                        lid: uid
                    }],
                [sequelize_1.Op.or]: [{
                        status: EOrderStatus_1.EOrderStatus.Paid
                    }, {
                        status: EOrderStatus_1.EOrderStatus.Servicing
                    }]
            },
            order: [['ctime']]
        });
    }
    /**
     * 验证订单
     * @param orderid
     * @param totalfee
     * @param wxorderid
     */
    checkPrice(orderid, totalfee, wxorderid) {
        return Order_1.default.findById(orderid).then(order => {
            if (!order) {
                return Promise.reject(new ErrorMsg_1.default(false, "订单不存在"));
            }
            if (order.payprice === totalfee) {
                //更新微信订单号和状态
                return Order_1.default.update({
                    status: EOrderStatus_1.EOrderStatus.Paid,
                    wxorderid: wxorderid,
                    paidtime: new Date()
                }, {
                    where: {
                        id: orderid
                    }
                });
            }
            else {
                return Promise.reject(Object.assign({ totalfee, payprice: order.payprice }, new ErrorMsg_1.default(false, "支付金额与订单金额不一致")));
            }
        });
    }
    /**
     * 支付回调成功 NOTE:不用了
     * @param req
     */
    recieve(req) {
        // return recieve(req).then(errorMsg=>{
        //     if(errorMsg.success){
        //         const data = errorMsg.data;
        //         //验证金额
        //         if(!data.total_fee){
        //             this.logHelper.errorOrder({
        //                 ip:getClientIp(req),
        //                 body:data,
        //                 message:"支付金额为空"
        //             });
        //             return Promise.reject(new ErrorMsg(false,""));
        //         }
        //         const totalfee = parseFloat(data.total_fee[0]);
        //         if(_.isNaN(totalfee)){
        //             this.logHelper.errorOrder({
        //                 ip:getClientIp(req),
        //                 body:data,
        //                 message:"支付金额不正确"
        //             });
        //             return Promise.reject(new ErrorMsg(false,"支付金额不正确"));
        //         }
        //         if(!data.out_trade_no||!data.out_trade_no[0]){
        //             this.logHelper.errorOrder({
        //                 ip:getClientIp(req),
        //                 body:data,
        //                 message:"订单号为空"
        //             });
        //             return Promise.reject(new ErrorMsg(false,"订单号为空"));
        //         }
        //         const orderid = parseInt(data.out_trade_no[0]);
        //         if(_.isNaN(orderid)){
        //             this.logHelper.errorOrder({
        //                 ip:getClientIp(req),
        //                 body:data,
        //                 message:"订单号格式不正确"
        //             });
        //             return Promise.reject(new ErrorMsg(false,"订单号格式不正确"));
        //         }
        //         return this.checkPrice(orderid,totalfee,data.transaction_id[0]).then(order=>{
        //             this.logHelper.appendOrder({
        //                 ip:getClientIp(req),
        //                 body:data,
        //                 message:"订单修改成功"
        //             });
        //             return order;
        //         },err=>{
        //             this.logHelper.errorOrder({
        //                 ip:getClientIp(req),
        //                 body:data,
        //                 message:err.message
        //             });
        //             return err;
        //         });
        //     }else{
        //         return Promise.reject(errorMsg);
        //     }
        // });
    }
    /**
     * 使用支付库支付回调
     * @param result
     */
    recievePay(result) {
        if (!result) {
            this.logHelper.errorOrder({
                body: result,
                message: "支付返回结果为空"
            });
            return Bluebird.reject(new ErrorMsg_1.default(false, "支付返回结果为空"));
        }
        const totalfee = parseFloat(result.total_fee);
        if (_.isNaN(totalfee)) {
            this.logHelper.errorOrder({
                body: result,
                message: "支付金额不正确"
            });
            return Bluebird.reject(new ErrorMsg_1.default(false, "支付金额不正确"));
        }
        if (!result.out_trade_no) {
            this.logHelper.errorOrder({
                body: result,
                message: "订单号为空"
            });
            return Bluebird.reject(new ErrorMsg_1.default(false, "订单号为空"));
        }
        const orderid = parseInt(result.out_trade_no);
        if (_.isNaN(orderid)) {
            this.logHelper.errorOrder({
                body: result,
                message: "订单号格式不正确"
            });
            return Bluebird.reject(new ErrorMsg_1.default(false, "订单号格式不正确"));
        }
        return this.checkPrice(orderid, totalfee, result.transaction_id).then(order => {
            this.logHelper.appendOrder({
                body: result,
                message: "订单支付成功"
            });
            return order;
        }, err => {
            this.logHelper.errorOrder({
                body: result,
                message: err.message
            });
            return Promise.reject(err);
        });
    }
    /**
     * 退款
     * @param userid
     * @param orderid
     */
    refund(userid, orderid) {
        return Order_1.default.findById(orderid).then(order => {
            if (!order) {
                return Promise.reject(new ErrorMsg_1.default(false, "订单不存在"));
            }
            if (order.status !== EOrderStatus_1.EOrderStatus.Paid) {
                return Promise.reject(new ErrorMsg_1.default(false, "订单非已支付状态"));
            }
            if (order.uid !== userid) {
                return Promise.reject(new ErrorMsg_1.default(false, "当前用户和订单不一致"));
            }
            if (order.status === EOrderStatus_1.EOrderStatus.Paid) {
                return Promise.reject(new ErrorMsg_1.default(false, "必须为已支付的订单"));
            }
            if (moment(new Date()).diff(moment(order.paidtime), "year") > 1) {
                return Promise.reject(new ErrorMsg_1.default(false, "退款的订单不能超过一年"));
            }
            return Order_1.default.update({
                status: EOrderStatus_1.EOrderStatus.RefundAudit,
                srefoundtime: new Date
            }, {
                where: {
                    id: orderid
                }
            }).then(res => {
                this.logHelper.appendOrder({
                    body: res,
                    message: "申请订单退款"
                });
                return res;
            });
            // this.wxPayHelper.refund(orderid,order.payprice).then(data=>{
            //     this.logHelper.appendOrder({
            //         body:data,
            //         message:"订单退款成功"
            //     });
            //     return data;
            // },err=>{
            //     this.logHelper.appendOrder({
            //         body:err,
            //         message:"订单退款失败"
            //     });
            //     return err;
            // });
        });
    }
    /**
     * 更新订单
     * @param userid
     * @param order
     */
    update(userid, order) {
        if (!order.id) {
            return Bluebird.reject(new ErrorMsg_1.default(false, "订单id非法"));
        }
        const orderid = order.id;
        delete order.id;
        return Order_1.default.findById(orderid).then(order => {
            if (!order) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "订单不存在"));
            }
            if (order.uid !== userid) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "订单用户不一致"));
            }
            return Order_1.default.update(order, {
                where: {
                    id: orderid
                }
            });
        });
    }
    /**
     * 聊天完成
     * @param orderid
     */
    chatComplete(userid, orderid, servicetime) {
        return this.update(userid, {
            status: EOrderStatus_1.EOrderStatus.Awaiting_Comment,
            completetype: ECompleteType_1.ECompleteType.Auto,
            completedtime: new Date(),
            servicetime: servicetime || 0,
            id: orderid
        });
    }
    /**
     * 更新服务时长
     * @param userid
     * @param orderid
     * @param servicetime
     */
    updateServicetime(userid, orderid, servicetime) {
        return this.update(userid, {
            servicetime: servicetime || 0,
            id: orderid
        });
    }
    /**
     * 更新订单为服务站
     * @param userid
     * @param orderid
     */
    updateServicing(userid, orderid) {
        return this.update(userid, {
            status: EOrderStatus_1.EOrderStatus.Servicing,
            id: orderid
        });
    }
    /**
     * 取消订单
     * @param userid
     * @param orderid
     */
    cancelOrder(userid, orderid) {
        return this.update(userid, {
            status: EOrderStatus_1.EOrderStatus.Cancelled,
            canceltime: new Date(),
            id: orderid
        });
    }
    /**
     * 获取统计数据
     * @param listenerid
     */
    getSummaryData(listenerid) {
        return Order_1.default.find({
            attributes: [
                [Sequelize.fn("COUNT", Sequelize.literal('DISTINCT `uid`')), 'ucount'],
                [Sequelize.fn("SUM", Sequelize.literal('`payservicetime`')), 'stime']
            ],
            where: {
                lid: listenerid,
                [Sequelize.Op.or]: [{
                        status: EOrderStatus_1.EOrderStatus.Completed
                    }, {
                        status: EOrderStatus_1.EOrderStatus.Awaiting_Comment
                    }]
            }
        }).then((data) => {
            if (!data.ucount) {
                data.setDataValue('ucount', 0);
            }
            if (!data.stime) {
                data.setDataValue('stime', 0);
            }
            return data;
        });
    }
    /**
     * 获取订单列表
     * @param userid
     * @param status
     * @param page
     */
    getOrderList(userid, status, page = {
        start: 0,
        limit: 20
    }) {
        if (!userid) {
            return Bluebird.reject(new ErrorMsg_1.default(false, "用户id不能为空"));
        }
        let tempStatus = [];
        if (_.isArray(status)) {
            if (!status.length) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "订单状态不能为空"));
            }
            const isAllIn = status.every(item => {
                return item in _.values(EOrderStatus_1.EOrderStatus);
            });
            if (!isAllIn) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "订单状态不正确"));
            }
            tempStatus = status;
        }
        else {
            if (!(status in _.values(EOrderStatus_1.EOrderStatus))) {
                return Bluebird.reject(new ErrorMsg_1.default(false, "订单状态不正确"));
            }
            tempStatus.push(status);
        }
        return Order_1.default.findAll({
            where: {
                uid: userid,
                status: {
                    [sequelize_1.Op.in]: tempStatus
                }
            },
            limit: page.limit,
            offset: page.start,
            include: [{
                    model: User_2.default,
                    as: "luser",
                    required: false
                }]
        });
    }
    static createInstance() {
        OrderService.getInstance();
    }
    static getInstance() {
        return this._instance || (this._instance = new this());
    }
}
exports.default = OrderService;
