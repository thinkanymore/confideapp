"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Sequelize = require("sequelize");
const mysqlSeq_1 = require("../mysqlSeq");
const User_1 = require("./User");
const GeneralSetting = mysqlSeq_1.default.define("generalsetting", {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, comment: "唯一id" },
    uid: { type: Sequelize.INTEGER, comment: "user外键", allowNull: false },
    position: { type: Sequelize.TINYINT, comment: "推广位置" },
    price: { type: Sequelize.FLOAT, comment: "推广单价" },
    dayprice: { type: Sequelize.FLOAT, defaultValue: 0, comment: "当日已推广金额" },
    limitprice: { type: Sequelize.FLOAT, comment: "当日推广限制金额" },
    status: { type: Sequelize.TINYINT, comment: "推广状态" }
}, {
    freezeTableName: true
});
GeneralSetting.belongsTo(User_1.default, {
    foreignKey: "uid"
});
GeneralSetting.sync({ alter: true });
exports.default = GeneralSetting;
