import { mergeTypeDefs } from '@graphql-tools/merge';
import { authTypeDefs } from './type.auth';
import { cafeTypeDefs } from './type.cafe';
import { menuTypeDefs } from './type.menu';
import { orderTypeDefs } from './type.order';
import { userTypeDefs } from './type.user';
import { shiftTypeDefs } from './type.shift';
import { logTypeDefs } from './type.log';

const types = [
  authTypeDefs,
  cafeTypeDefs,
  menuTypeDefs,
  orderTypeDefs,
  userTypeDefs,
  shiftTypeDefs,
  logTypeDefs,
];

export const typeDefs = mergeTypeDefs(types);

