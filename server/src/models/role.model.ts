import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  cafeId?: mongoose.Types.ObjectId;
  name: string;
  permissions: string[];
  scope: 'SYSTEM' | 'CAFE' | 'STATION';
}

const roleSchema = new Schema<IRole>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: false, index: true },
    name: { type: String, required: true },
    permissions: [{ type: String }],
    scope: { type: String, enum: ['SYSTEM', 'CAFE', 'STATION'], default: 'CAFE' },
  },
  { timestamps: true }
);

export const Role = mongoose.model<IRole>('Role', roleSchema);
