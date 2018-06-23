"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Sequelize = require("sequelize");
const mysqlSeq_1 = require("../mysqlSeq");
const MainLabel = mysqlSeq_1.default.define('mainlbale', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, comment: "唯一id" },
    name: { type: Sequelize.STRING, allowNull: false, comment: "名称" },
    cuid: { type: Sequelize.INTEGER, comment: "创建人id" },
    type: { type: Sequelize.TINYINT, defaultValue: 0, comment: "类型：0、系统；1、用户自定义" },
    status: { type: Sequelize.TINYINT, defaultValue: 0, comment: "状态:-1、删除，0：正常，1：审核" }
}, {
    freezeTableName: true
});
MainLabel.sync();
exports.default = MainLabel;
