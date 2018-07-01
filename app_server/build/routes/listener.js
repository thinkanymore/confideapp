"use strict";
const express = require("express");
const check_1 = require("express-validator/check");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const uuid = require("uuid");
const ErrorMsg_1 = require("../model/ErrorMsg");
const Listener_1 = require("../controller/Listener");
const objectHelper_1 = require("../helper/objectHelper");
const router = express.Router();
const listenCtrl = Listener_1.default.getInstance();
const execPath = process.cwd();
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let dir = `files/images/${req.query.userid}`;
        dir = path.resolve(execPath, dir);
        fs.exists(dir, exist => {
            if (!exist) {
                fs.mkdir(dir, err => {
                    if (err) {
                        cb(err, null);
                        return;
                    }
                    cb(null, dir);
                });
            }
            else {
                cb(null, dir);
            }
        });
    },
    filename: function (req, file, cb) {
        const extname = path.extname(file.originalname);
        cb(null, uuid().toString() + extname);
    }
});
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 6
    }
});
router.get("/", [check_1.query("userid").isNumeric().withMessage("用户编号非法")], function (req, res, next) {
    const errors = check_1.validationResult(req);
    if (!errors.isEmpty()) {
        return res.json(new ErrorMsg_1.default(false, errors.array()[0].msg));
    }
    listenCtrl.findByUserid(req.query.userid).then(data => {
        res.json(Object.assign({ data }, new ErrorMsg_1.default(true)));
    }, err => {
        res.json(new ErrorMsg_1.default(false, err.message, err));
    }).catch(err => {
        res.json(new ErrorMsg_1.default(false, err || err.message, err));
    });
});
router.post("/", [check_1.query("userid").isNumeric().withMessage("用户编号非法")], [check_1.body("data").isEmpty().withMessage("提交数据不能为空")], upload.array("files", 6), function (req, res, next) {
    const errors = check_1.validationResult(req);
    if (!errors.isEmpty()) {
        return res.json(new ErrorMsg_1.default(false, errors.array()[0].msg));
    }
    const listener = objectHelper_1.default.serialize(req.body.data);
    listener.uid = req.query.userid;
    try {
        listener.certificateurls = JSON.stringify((req.files || []).map(item => item.path).map(item => item.replace(execPath, "")));
    }
    catch (e) {
        listener.certificateurls = "[]";
    }
    listenCtrl.bindListener(listener).then(data => {
        res.json(new ErrorMsg_1.default(true, "创建成功"));
    }, err => {
        res.json(new ErrorMsg_1.default(false, err.message));
    }).catch(err => {
        res.json(new ErrorMsg_1.default(false, err || err.message));
    });
});
module.exports = router;
