"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDefs = void 0;
const merge_1 = require("@graphql-tools/merge");
const type_auth_1 = require("./type.auth");
const type_cafe_1 = require("./type.cafe");
const type_menu_1 = require("./type.menu");
const type_order_1 = require("./type.order");
const type_user_1 = require("./type.user");
const type_shift_1 = require("./type.shift");
const type_log_1 = require("./type.log");
const types = [
    type_auth_1.authTypeDefs,
    type_cafe_1.cafeTypeDefs,
    type_menu_1.menuTypeDefs,
    type_order_1.orderTypeDefs,
    type_user_1.userTypeDefs,
    type_shift_1.shiftTypeDefs,
    type_log_1.logTypeDefs,
];
exports.typeDefs = (0, merge_1.mergeTypeDefs)(types);
