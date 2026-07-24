declare module '@sinclair/typebox' {
  export type TSchema = unknown;
  export interface TypeBuilder {
    [key: string]: any;
  }
  export const Type: TypeBuilder;
  export const Value: any;
  export const TypeCompiler: any;
  export const TypeSystem: any;
  export const SchemaOptions: any;
}
