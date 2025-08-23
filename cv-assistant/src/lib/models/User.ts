import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const ProjectSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  summary: { type: String, default: '' },
});

const ExperienceSchema = new Schema({
  companyName: { type: String, required: true },
  role: { type: String, required: true },
  timeFrom: { type: String, default: '' },
  timeTo: { type: String, default: '' },
  description: { type: String, default: '' },
  summary: { type: String, default: '' },
});

const ProfileSchema = new Schema({
  name: { type: String, default: '' },
  major: { type: String, default: '' },
  school: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  website: { type: String, default: '' },
  linkedin: { type: String, default: '' },
  languages: { type: String, default: '' },
  projects: { type: [ProjectSchema], default: [] },
  experiences: { type: [ExperienceSchema], default: [] },
});

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  profile: { type: ProfileSchema, default: {} },
});

export type Project = InferSchemaType<typeof ProjectSchema>;
export type Experience = InferSchemaType<typeof ExperienceSchema>;
export type Profile = InferSchemaType<typeof ProfileSchema>;
export type User = InferSchemaType<typeof UserSchema>;

export const UserModel: Model<User> = mongoose.models.User || mongoose.model<User>('User', UserSchema);


