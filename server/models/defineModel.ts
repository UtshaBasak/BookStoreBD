import mongoose, { type Model, type Schema } from 'mongoose';

/**
 * Registers a model, or hands back the one already registered.
 *
 * Mongoose throws OverwriteModelError if a name is registered twice, which a
 * plain `mongoose.model(...)` call does as soon as a module is imported more
 * than once - exactly what the tests do when they reset the module registry to
 * re-read configuration.
 */
export const defineModel = <TAttributes>(
  name: string,
  schema: Schema<TAttributes>
): Model<TAttributes> =>
  (mongoose.models[name] as Model<TAttributes> | undefined) ??
  mongoose.model<TAttributes>(name, schema);

export default defineModel;
