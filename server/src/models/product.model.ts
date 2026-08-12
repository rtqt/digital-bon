import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  cafeId: mongoose.Types.ObjectId;
  name: string;
  order: number;
}

export interface IProduct extends Document {
  cafeId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  cost: number;
  isAvailable: boolean;
}

const categorySchema = new Schema<ICategory>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const productSchema = new Schema<IProduct>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, required: true },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Category = mongoose.model<ICategory>('Category', categorySchema);
export const Product = mongoose.model<IProduct>('Product', productSchema);
