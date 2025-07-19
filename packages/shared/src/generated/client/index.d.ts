
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Game
 * 
 */
export type Game = $Result.DefaultSelection<Prisma.$GamePayload>
/**
 * Model Player
 * 
 */
export type Player = $Result.DefaultSelection<Prisma.$PlayerPayload>
/**
 * Model Character
 * 
 */
export type Character = $Result.DefaultSelection<Prisma.$CharacterPayload>
/**
 * Model Map
 * 
 */
export type Map = $Result.DefaultSelection<Prisma.$MapPayload>
/**
 * Model GameMode
 * 
 */
export type GameMode = $Result.DefaultSelection<Prisma.$GameModePayload>
/**
 * Model Match
 * 
 */
export type Match = $Result.DefaultSelection<Prisma.$MatchPayload>
/**
 * Model MatchResult
 * 
 */
export type MatchResult = $Result.DefaultSelection<Prisma.$MatchResultPayload>
/**
 * Model PlayerStats
 * 
 */
export type PlayerStats = $Result.DefaultSelection<Prisma.$PlayerStatsPayload>
/**
 * Model JobQueue
 * 
 */
export type JobQueue = $Result.DefaultSelection<Prisma.$JobQueuePayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Games
 * const games = await prisma.game.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Games
   * const games = await prisma.game.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.game`: Exposes CRUD operations for the **Game** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Games
    * const games = await prisma.game.findMany()
    * ```
    */
  get game(): Prisma.GameDelegate<ExtArgs>;

  /**
   * `prisma.player`: Exposes CRUD operations for the **Player** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Players
    * const players = await prisma.player.findMany()
    * ```
    */
  get player(): Prisma.PlayerDelegate<ExtArgs>;

  /**
   * `prisma.character`: Exposes CRUD operations for the **Character** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Characters
    * const characters = await prisma.character.findMany()
    * ```
    */
  get character(): Prisma.CharacterDelegate<ExtArgs>;

  /**
   * `prisma.map`: Exposes CRUD operations for the **Map** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Maps
    * const maps = await prisma.map.findMany()
    * ```
    */
  get map(): Prisma.MapDelegate<ExtArgs>;

  /**
   * `prisma.gameMode`: Exposes CRUD operations for the **GameMode** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more GameModes
    * const gameModes = await prisma.gameMode.findMany()
    * ```
    */
  get gameMode(): Prisma.GameModeDelegate<ExtArgs>;

  /**
   * `prisma.match`: Exposes CRUD operations for the **Match** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Matches
    * const matches = await prisma.match.findMany()
    * ```
    */
  get match(): Prisma.MatchDelegate<ExtArgs>;

  /**
   * `prisma.matchResult`: Exposes CRUD operations for the **MatchResult** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more MatchResults
    * const matchResults = await prisma.matchResult.findMany()
    * ```
    */
  get matchResult(): Prisma.MatchResultDelegate<ExtArgs>;

  /**
   * `prisma.playerStats`: Exposes CRUD operations for the **PlayerStats** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more PlayerStats
    * const playerStats = await prisma.playerStats.findMany()
    * ```
    */
  get playerStats(): Prisma.PlayerStatsDelegate<ExtArgs>;

  /**
   * `prisma.jobQueue`: Exposes CRUD operations for the **JobQueue** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more JobQueues
    * const jobQueues = await prisma.jobQueue.findMany()
    * ```
    */
  get jobQueue(): Prisma.JobQueueDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Game: 'Game',
    Player: 'Player',
    Character: 'Character',
    Map: 'Map',
    GameMode: 'GameMode',
    Match: 'Match',
    MatchResult: 'MatchResult',
    PlayerStats: 'PlayerStats',
    JobQueue: 'JobQueue'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "game" | "player" | "character" | "map" | "gameMode" | "match" | "matchResult" | "playerStats" | "jobQueue"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Game: {
        payload: Prisma.$GamePayload<ExtArgs>
        fields: Prisma.GameFieldRefs
        operations: {
          findUnique: {
            args: Prisma.GameFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.GameFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>
          }
          findFirst: {
            args: Prisma.GameFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.GameFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>
          }
          findMany: {
            args: Prisma.GameFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>[]
          }
          create: {
            args: Prisma.GameCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>
          }
          createMany: {
            args: Prisma.GameCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.GameCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>[]
          }
          delete: {
            args: Prisma.GameDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>
          }
          update: {
            args: Prisma.GameUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>
          }
          deleteMany: {
            args: Prisma.GameDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.GameUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.GameUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GamePayload>
          }
          aggregate: {
            args: Prisma.GameAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateGame>
          }
          groupBy: {
            args: Prisma.GameGroupByArgs<ExtArgs>
            result: $Utils.Optional<GameGroupByOutputType>[]
          }
          count: {
            args: Prisma.GameCountArgs<ExtArgs>
            result: $Utils.Optional<GameCountAggregateOutputType> | number
          }
        }
      }
      Player: {
        payload: Prisma.$PlayerPayload<ExtArgs>
        fields: Prisma.PlayerFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PlayerFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PlayerFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>
          }
          findFirst: {
            args: Prisma.PlayerFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PlayerFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>
          }
          findMany: {
            args: Prisma.PlayerFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>[]
          }
          create: {
            args: Prisma.PlayerCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>
          }
          createMany: {
            args: Prisma.PlayerCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PlayerCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>[]
          }
          delete: {
            args: Prisma.PlayerDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>
          }
          update: {
            args: Prisma.PlayerUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>
          }
          deleteMany: {
            args: Prisma.PlayerDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PlayerUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PlayerUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerPayload>
          }
          aggregate: {
            args: Prisma.PlayerAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePlayer>
          }
          groupBy: {
            args: Prisma.PlayerGroupByArgs<ExtArgs>
            result: $Utils.Optional<PlayerGroupByOutputType>[]
          }
          count: {
            args: Prisma.PlayerCountArgs<ExtArgs>
            result: $Utils.Optional<PlayerCountAggregateOutputType> | number
          }
        }
      }
      Character: {
        payload: Prisma.$CharacterPayload<ExtArgs>
        fields: Prisma.CharacterFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CharacterFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CharacterFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>
          }
          findFirst: {
            args: Prisma.CharacterFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CharacterFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>
          }
          findMany: {
            args: Prisma.CharacterFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>[]
          }
          create: {
            args: Prisma.CharacterCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>
          }
          createMany: {
            args: Prisma.CharacterCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CharacterCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>[]
          }
          delete: {
            args: Prisma.CharacterDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>
          }
          update: {
            args: Prisma.CharacterUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>
          }
          deleteMany: {
            args: Prisma.CharacterDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CharacterUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.CharacterUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CharacterPayload>
          }
          aggregate: {
            args: Prisma.CharacterAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCharacter>
          }
          groupBy: {
            args: Prisma.CharacterGroupByArgs<ExtArgs>
            result: $Utils.Optional<CharacterGroupByOutputType>[]
          }
          count: {
            args: Prisma.CharacterCountArgs<ExtArgs>
            result: $Utils.Optional<CharacterCountAggregateOutputType> | number
          }
        }
      }
      Map: {
        payload: Prisma.$MapPayload<ExtArgs>
        fields: Prisma.MapFieldRefs
        operations: {
          findUnique: {
            args: Prisma.MapFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.MapFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>
          }
          findFirst: {
            args: Prisma.MapFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.MapFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>
          }
          findMany: {
            args: Prisma.MapFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>[]
          }
          create: {
            args: Prisma.MapCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>
          }
          createMany: {
            args: Prisma.MapCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.MapCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>[]
          }
          delete: {
            args: Prisma.MapDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>
          }
          update: {
            args: Prisma.MapUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>
          }
          deleteMany: {
            args: Prisma.MapDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.MapUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.MapUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MapPayload>
          }
          aggregate: {
            args: Prisma.MapAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateMap>
          }
          groupBy: {
            args: Prisma.MapGroupByArgs<ExtArgs>
            result: $Utils.Optional<MapGroupByOutputType>[]
          }
          count: {
            args: Prisma.MapCountArgs<ExtArgs>
            result: $Utils.Optional<MapCountAggregateOutputType> | number
          }
        }
      }
      GameMode: {
        payload: Prisma.$GameModePayload<ExtArgs>
        fields: Prisma.GameModeFieldRefs
        operations: {
          findUnique: {
            args: Prisma.GameModeFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.GameModeFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>
          }
          findFirst: {
            args: Prisma.GameModeFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.GameModeFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>
          }
          findMany: {
            args: Prisma.GameModeFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>[]
          }
          create: {
            args: Prisma.GameModeCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>
          }
          createMany: {
            args: Prisma.GameModeCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.GameModeCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>[]
          }
          delete: {
            args: Prisma.GameModeDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>
          }
          update: {
            args: Prisma.GameModeUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>
          }
          deleteMany: {
            args: Prisma.GameModeDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.GameModeUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.GameModeUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameModePayload>
          }
          aggregate: {
            args: Prisma.GameModeAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateGameMode>
          }
          groupBy: {
            args: Prisma.GameModeGroupByArgs<ExtArgs>
            result: $Utils.Optional<GameModeGroupByOutputType>[]
          }
          count: {
            args: Prisma.GameModeCountArgs<ExtArgs>
            result: $Utils.Optional<GameModeCountAggregateOutputType> | number
          }
        }
      }
      Match: {
        payload: Prisma.$MatchPayload<ExtArgs>
        fields: Prisma.MatchFieldRefs
        operations: {
          findUnique: {
            args: Prisma.MatchFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.MatchFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>
          }
          findFirst: {
            args: Prisma.MatchFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.MatchFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>
          }
          findMany: {
            args: Prisma.MatchFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>[]
          }
          create: {
            args: Prisma.MatchCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>
          }
          createMany: {
            args: Prisma.MatchCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.MatchCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>[]
          }
          delete: {
            args: Prisma.MatchDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>
          }
          update: {
            args: Prisma.MatchUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>
          }
          deleteMany: {
            args: Prisma.MatchDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.MatchUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.MatchUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchPayload>
          }
          aggregate: {
            args: Prisma.MatchAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateMatch>
          }
          groupBy: {
            args: Prisma.MatchGroupByArgs<ExtArgs>
            result: $Utils.Optional<MatchGroupByOutputType>[]
          }
          count: {
            args: Prisma.MatchCountArgs<ExtArgs>
            result: $Utils.Optional<MatchCountAggregateOutputType> | number
          }
        }
      }
      MatchResult: {
        payload: Prisma.$MatchResultPayload<ExtArgs>
        fields: Prisma.MatchResultFieldRefs
        operations: {
          findUnique: {
            args: Prisma.MatchResultFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.MatchResultFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>
          }
          findFirst: {
            args: Prisma.MatchResultFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.MatchResultFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>
          }
          findMany: {
            args: Prisma.MatchResultFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>[]
          }
          create: {
            args: Prisma.MatchResultCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>
          }
          createMany: {
            args: Prisma.MatchResultCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.MatchResultCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>[]
          }
          delete: {
            args: Prisma.MatchResultDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>
          }
          update: {
            args: Prisma.MatchResultUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>
          }
          deleteMany: {
            args: Prisma.MatchResultDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.MatchResultUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.MatchResultUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MatchResultPayload>
          }
          aggregate: {
            args: Prisma.MatchResultAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateMatchResult>
          }
          groupBy: {
            args: Prisma.MatchResultGroupByArgs<ExtArgs>
            result: $Utils.Optional<MatchResultGroupByOutputType>[]
          }
          count: {
            args: Prisma.MatchResultCountArgs<ExtArgs>
            result: $Utils.Optional<MatchResultCountAggregateOutputType> | number
          }
        }
      }
      PlayerStats: {
        payload: Prisma.$PlayerStatsPayload<ExtArgs>
        fields: Prisma.PlayerStatsFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PlayerStatsFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PlayerStatsFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>
          }
          findFirst: {
            args: Prisma.PlayerStatsFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PlayerStatsFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>
          }
          findMany: {
            args: Prisma.PlayerStatsFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>[]
          }
          create: {
            args: Prisma.PlayerStatsCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>
          }
          createMany: {
            args: Prisma.PlayerStatsCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PlayerStatsCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>[]
          }
          delete: {
            args: Prisma.PlayerStatsDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>
          }
          update: {
            args: Prisma.PlayerStatsUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>
          }
          deleteMany: {
            args: Prisma.PlayerStatsDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PlayerStatsUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PlayerStatsUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PlayerStatsPayload>
          }
          aggregate: {
            args: Prisma.PlayerStatsAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePlayerStats>
          }
          groupBy: {
            args: Prisma.PlayerStatsGroupByArgs<ExtArgs>
            result: $Utils.Optional<PlayerStatsGroupByOutputType>[]
          }
          count: {
            args: Prisma.PlayerStatsCountArgs<ExtArgs>
            result: $Utils.Optional<PlayerStatsCountAggregateOutputType> | number
          }
        }
      }
      JobQueue: {
        payload: Prisma.$JobQueuePayload<ExtArgs>
        fields: Prisma.JobQueueFieldRefs
        operations: {
          findUnique: {
            args: Prisma.JobQueueFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.JobQueueFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>
          }
          findFirst: {
            args: Prisma.JobQueueFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.JobQueueFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>
          }
          findMany: {
            args: Prisma.JobQueueFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>[]
          }
          create: {
            args: Prisma.JobQueueCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>
          }
          createMany: {
            args: Prisma.JobQueueCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.JobQueueCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>[]
          }
          delete: {
            args: Prisma.JobQueueDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>
          }
          update: {
            args: Prisma.JobQueueUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>
          }
          deleteMany: {
            args: Prisma.JobQueueDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.JobQueueUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.JobQueueUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$JobQueuePayload>
          }
          aggregate: {
            args: Prisma.JobQueueAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateJobQueue>
          }
          groupBy: {
            args: Prisma.JobQueueGroupByArgs<ExtArgs>
            result: $Utils.Optional<JobQueueGroupByOutputType>[]
          }
          count: {
            args: Prisma.JobQueueCountArgs<ExtArgs>
            result: $Utils.Optional<JobQueueCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type GameCountOutputType
   */

  export type GameCountOutputType = {
    players: number
    matches: number
    characters: number
    maps: number
    gameModes: number
    playerStats: number
    jobQueue: number
  }

  export type GameCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    players?: boolean | GameCountOutputTypeCountPlayersArgs
    matches?: boolean | GameCountOutputTypeCountMatchesArgs
    characters?: boolean | GameCountOutputTypeCountCharactersArgs
    maps?: boolean | GameCountOutputTypeCountMapsArgs
    gameModes?: boolean | GameCountOutputTypeCountGameModesArgs
    playerStats?: boolean | GameCountOutputTypeCountPlayerStatsArgs
    jobQueue?: boolean | GameCountOutputTypeCountJobQueueArgs
  }

  // Custom InputTypes
  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameCountOutputType
     */
    select?: GameCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountPlayersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlayerWhereInput
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountMatchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchWhereInput
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountCharactersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CharacterWhereInput
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountMapsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MapWhereInput
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountGameModesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GameModeWhereInput
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountPlayerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlayerStatsWhereInput
  }

  /**
   * GameCountOutputType without action
   */
  export type GameCountOutputTypeCountJobQueueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: JobQueueWhereInput
  }


  /**
   * Count Type PlayerCountOutputType
   */

  export type PlayerCountOutputType = {
    playerStats: number
    matchResults: number
  }

  export type PlayerCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    playerStats?: boolean | PlayerCountOutputTypeCountPlayerStatsArgs
    matchResults?: boolean | PlayerCountOutputTypeCountMatchResultsArgs
  }

  // Custom InputTypes
  /**
   * PlayerCountOutputType without action
   */
  export type PlayerCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerCountOutputType
     */
    select?: PlayerCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * PlayerCountOutputType without action
   */
  export type PlayerCountOutputTypeCountPlayerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlayerStatsWhereInput
  }

  /**
   * PlayerCountOutputType without action
   */
  export type PlayerCountOutputTypeCountMatchResultsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchResultWhereInput
  }


  /**
   * Count Type CharacterCountOutputType
   */

  export type CharacterCountOutputType = {
    matchResults: number
  }

  export type CharacterCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    matchResults?: boolean | CharacterCountOutputTypeCountMatchResultsArgs
  }

  // Custom InputTypes
  /**
   * CharacterCountOutputType without action
   */
  export type CharacterCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CharacterCountOutputType
     */
    select?: CharacterCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CharacterCountOutputType without action
   */
  export type CharacterCountOutputTypeCountMatchResultsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchResultWhereInput
  }


  /**
   * Count Type MapCountOutputType
   */

  export type MapCountOutputType = {
    matches: number
  }

  export type MapCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    matches?: boolean | MapCountOutputTypeCountMatchesArgs
  }

  // Custom InputTypes
  /**
   * MapCountOutputType without action
   */
  export type MapCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MapCountOutputType
     */
    select?: MapCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * MapCountOutputType without action
   */
  export type MapCountOutputTypeCountMatchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchWhereInput
  }


  /**
   * Count Type GameModeCountOutputType
   */

  export type GameModeCountOutputType = {
    matches: number
  }

  export type GameModeCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    matches?: boolean | GameModeCountOutputTypeCountMatchesArgs
  }

  // Custom InputTypes
  /**
   * GameModeCountOutputType without action
   */
  export type GameModeCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameModeCountOutputType
     */
    select?: GameModeCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * GameModeCountOutputType without action
   */
  export type GameModeCountOutputTypeCountMatchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchWhereInput
  }


  /**
   * Count Type MatchCountOutputType
   */

  export type MatchCountOutputType = {
    matchResults: number
    playerStats: number
  }

  export type MatchCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    matchResults?: boolean | MatchCountOutputTypeCountMatchResultsArgs
    playerStats?: boolean | MatchCountOutputTypeCountPlayerStatsArgs
  }

  // Custom InputTypes
  /**
   * MatchCountOutputType without action
   */
  export type MatchCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchCountOutputType
     */
    select?: MatchCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * MatchCountOutputType without action
   */
  export type MatchCountOutputTypeCountMatchResultsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchResultWhereInput
  }

  /**
   * MatchCountOutputType without action
   */
  export type MatchCountOutputTypeCountPlayerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlayerStatsWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Game
   */

  export type AggregateGame = {
    _count: GameCountAggregateOutputType | null
    _min: GameMinAggregateOutputType | null
    _max: GameMaxAggregateOutputType | null
  }

  export type GameMinAggregateOutputType = {
    id: string | null
    name: string | null
    displayName: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GameMaxAggregateOutputType = {
    id: string | null
    name: string | null
    displayName: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GameCountAggregateOutputType = {
    id: number
    name: number
    displayName: number
    isActive: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type GameMinAggregateInputType = {
    id?: true
    name?: true
    displayName?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GameMaxAggregateInputType = {
    id?: true
    name?: true
    displayName?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GameCountAggregateInputType = {
    id?: true
    name?: true
    displayName?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type GameAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Game to aggregate.
     */
    where?: GameWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Games to fetch.
     */
    orderBy?: GameOrderByWithRelationInput | GameOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: GameWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Games from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Games.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Games
    **/
    _count?: true | GameCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: GameMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: GameMaxAggregateInputType
  }

  export type GetGameAggregateType<T extends GameAggregateArgs> = {
        [P in keyof T & keyof AggregateGame]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateGame[P]>
      : GetScalarType<T[P], AggregateGame[P]>
  }




  export type GameGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GameWhereInput
    orderBy?: GameOrderByWithAggregationInput | GameOrderByWithAggregationInput[]
    by: GameScalarFieldEnum[] | GameScalarFieldEnum
    having?: GameScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: GameCountAggregateInputType | true
    _min?: GameMinAggregateInputType
    _max?: GameMaxAggregateInputType
  }

  export type GameGroupByOutputType = {
    id: string
    name: string
    displayName: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    _count: GameCountAggregateOutputType | null
    _min: GameMinAggregateOutputType | null
    _max: GameMaxAggregateOutputType | null
  }

  type GetGameGroupByPayload<T extends GameGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<GameGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof GameGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], GameGroupByOutputType[P]>
            : GetScalarType<T[P], GameGroupByOutputType[P]>
        }
      >
    >


  export type GameSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    displayName?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    players?: boolean | Game$playersArgs<ExtArgs>
    matches?: boolean | Game$matchesArgs<ExtArgs>
    characters?: boolean | Game$charactersArgs<ExtArgs>
    maps?: boolean | Game$mapsArgs<ExtArgs>
    gameModes?: boolean | Game$gameModesArgs<ExtArgs>
    playerStats?: boolean | Game$playerStatsArgs<ExtArgs>
    jobQueue?: boolean | Game$jobQueueArgs<ExtArgs>
    _count?: boolean | GameCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["game"]>

  export type GameSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    displayName?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["game"]>

  export type GameSelectScalar = {
    id?: boolean
    name?: boolean
    displayName?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type GameInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    players?: boolean | Game$playersArgs<ExtArgs>
    matches?: boolean | Game$matchesArgs<ExtArgs>
    characters?: boolean | Game$charactersArgs<ExtArgs>
    maps?: boolean | Game$mapsArgs<ExtArgs>
    gameModes?: boolean | Game$gameModesArgs<ExtArgs>
    playerStats?: boolean | Game$playerStatsArgs<ExtArgs>
    jobQueue?: boolean | Game$jobQueueArgs<ExtArgs>
    _count?: boolean | GameCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type GameIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $GamePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Game"
    objects: {
      players: Prisma.$PlayerPayload<ExtArgs>[]
      matches: Prisma.$MatchPayload<ExtArgs>[]
      characters: Prisma.$CharacterPayload<ExtArgs>[]
      maps: Prisma.$MapPayload<ExtArgs>[]
      gameModes: Prisma.$GameModePayload<ExtArgs>[]
      playerStats: Prisma.$PlayerStatsPayload<ExtArgs>[]
      jobQueue: Prisma.$JobQueuePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      displayName: string
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["game"]>
    composites: {}
  }

  type GameGetPayload<S extends boolean | null | undefined | GameDefaultArgs> = $Result.GetResult<Prisma.$GamePayload, S>

  type GameCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<GameFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: GameCountAggregateInputType | true
    }

  export interface GameDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Game'], meta: { name: 'Game' } }
    /**
     * Find zero or one Game that matches the filter.
     * @param {GameFindUniqueArgs} args - Arguments to find a Game
     * @example
     * // Get one Game
     * const game = await prisma.game.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends GameFindUniqueArgs>(args: SelectSubset<T, GameFindUniqueArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Game that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {GameFindUniqueOrThrowArgs} args - Arguments to find a Game
     * @example
     * // Get one Game
     * const game = await prisma.game.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends GameFindUniqueOrThrowArgs>(args: SelectSubset<T, GameFindUniqueOrThrowArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Game that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameFindFirstArgs} args - Arguments to find a Game
     * @example
     * // Get one Game
     * const game = await prisma.game.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends GameFindFirstArgs>(args?: SelectSubset<T, GameFindFirstArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Game that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameFindFirstOrThrowArgs} args - Arguments to find a Game
     * @example
     * // Get one Game
     * const game = await prisma.game.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends GameFindFirstOrThrowArgs>(args?: SelectSubset<T, GameFindFirstOrThrowArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Games that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Games
     * const games = await prisma.game.findMany()
     * 
     * // Get first 10 Games
     * const games = await prisma.game.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const gameWithIdOnly = await prisma.game.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends GameFindManyArgs>(args?: SelectSubset<T, GameFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Game.
     * @param {GameCreateArgs} args - Arguments to create a Game.
     * @example
     * // Create one Game
     * const Game = await prisma.game.create({
     *   data: {
     *     // ... data to create a Game
     *   }
     * })
     * 
     */
    create<T extends GameCreateArgs>(args: SelectSubset<T, GameCreateArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Games.
     * @param {GameCreateManyArgs} args - Arguments to create many Games.
     * @example
     * // Create many Games
     * const game = await prisma.game.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends GameCreateManyArgs>(args?: SelectSubset<T, GameCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Games and returns the data saved in the database.
     * @param {GameCreateManyAndReturnArgs} args - Arguments to create many Games.
     * @example
     * // Create many Games
     * const game = await prisma.game.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Games and only return the `id`
     * const gameWithIdOnly = await prisma.game.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends GameCreateManyAndReturnArgs>(args?: SelectSubset<T, GameCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Game.
     * @param {GameDeleteArgs} args - Arguments to delete one Game.
     * @example
     * // Delete one Game
     * const Game = await prisma.game.delete({
     *   where: {
     *     // ... filter to delete one Game
     *   }
     * })
     * 
     */
    delete<T extends GameDeleteArgs>(args: SelectSubset<T, GameDeleteArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Game.
     * @param {GameUpdateArgs} args - Arguments to update one Game.
     * @example
     * // Update one Game
     * const game = await prisma.game.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends GameUpdateArgs>(args: SelectSubset<T, GameUpdateArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Games.
     * @param {GameDeleteManyArgs} args - Arguments to filter Games to delete.
     * @example
     * // Delete a few Games
     * const { count } = await prisma.game.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends GameDeleteManyArgs>(args?: SelectSubset<T, GameDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Games.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Games
     * const game = await prisma.game.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends GameUpdateManyArgs>(args: SelectSubset<T, GameUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Game.
     * @param {GameUpsertArgs} args - Arguments to update or create a Game.
     * @example
     * // Update or create a Game
     * const game = await prisma.game.upsert({
     *   create: {
     *     // ... data to create a Game
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Game we want to update
     *   }
     * })
     */
    upsert<T extends GameUpsertArgs>(args: SelectSubset<T, GameUpsertArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Games.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameCountArgs} args - Arguments to filter Games to count.
     * @example
     * // Count the number of Games
     * const count = await prisma.game.count({
     *   where: {
     *     // ... the filter for the Games we want to count
     *   }
     * })
    **/
    count<T extends GameCountArgs>(
      args?: Subset<T, GameCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], GameCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Game.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends GameAggregateArgs>(args: Subset<T, GameAggregateArgs>): Prisma.PrismaPromise<GetGameAggregateType<T>>

    /**
     * Group by Game.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends GameGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: GameGroupByArgs['orderBy'] }
        : { orderBy?: GameGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, GameGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetGameGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Game model
   */
  readonly fields: GameFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Game.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__GameClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    players<T extends Game$playersArgs<ExtArgs> = {}>(args?: Subset<T, Game$playersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findMany"> | Null>
    matches<T extends Game$matchesArgs<ExtArgs> = {}>(args?: Subset<T, Game$matchesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findMany"> | Null>
    characters<T extends Game$charactersArgs<ExtArgs> = {}>(args?: Subset<T, Game$charactersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findMany"> | Null>
    maps<T extends Game$mapsArgs<ExtArgs> = {}>(args?: Subset<T, Game$mapsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findMany"> | Null>
    gameModes<T extends Game$gameModesArgs<ExtArgs> = {}>(args?: Subset<T, Game$gameModesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findMany"> | Null>
    playerStats<T extends Game$playerStatsArgs<ExtArgs> = {}>(args?: Subset<T, Game$playerStatsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findMany"> | Null>
    jobQueue<T extends Game$jobQueueArgs<ExtArgs> = {}>(args?: Subset<T, Game$jobQueueArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Game model
   */ 
  interface GameFieldRefs {
    readonly id: FieldRef<"Game", 'String'>
    readonly name: FieldRef<"Game", 'String'>
    readonly displayName: FieldRef<"Game", 'String'>
    readonly isActive: FieldRef<"Game", 'Boolean'>
    readonly createdAt: FieldRef<"Game", 'DateTime'>
    readonly updatedAt: FieldRef<"Game", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Game findUnique
   */
  export type GameFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * Filter, which Game to fetch.
     */
    where: GameWhereUniqueInput
  }

  /**
   * Game findUniqueOrThrow
   */
  export type GameFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * Filter, which Game to fetch.
     */
    where: GameWhereUniqueInput
  }

  /**
   * Game findFirst
   */
  export type GameFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * Filter, which Game to fetch.
     */
    where?: GameWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Games to fetch.
     */
    orderBy?: GameOrderByWithRelationInput | GameOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Games.
     */
    cursor?: GameWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Games from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Games.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Games.
     */
    distinct?: GameScalarFieldEnum | GameScalarFieldEnum[]
  }

  /**
   * Game findFirstOrThrow
   */
  export type GameFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * Filter, which Game to fetch.
     */
    where?: GameWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Games to fetch.
     */
    orderBy?: GameOrderByWithRelationInput | GameOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Games.
     */
    cursor?: GameWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Games from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Games.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Games.
     */
    distinct?: GameScalarFieldEnum | GameScalarFieldEnum[]
  }

  /**
   * Game findMany
   */
  export type GameFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * Filter, which Games to fetch.
     */
    where?: GameWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Games to fetch.
     */
    orderBy?: GameOrderByWithRelationInput | GameOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Games.
     */
    cursor?: GameWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Games from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Games.
     */
    skip?: number
    distinct?: GameScalarFieldEnum | GameScalarFieldEnum[]
  }

  /**
   * Game create
   */
  export type GameCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * The data needed to create a Game.
     */
    data: XOR<GameCreateInput, GameUncheckedCreateInput>
  }

  /**
   * Game createMany
   */
  export type GameCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Games.
     */
    data: GameCreateManyInput | GameCreateManyInput[]
  }

  /**
   * Game createManyAndReturn
   */
  export type GameCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Games.
     */
    data: GameCreateManyInput | GameCreateManyInput[]
  }

  /**
   * Game update
   */
  export type GameUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * The data needed to update a Game.
     */
    data: XOR<GameUpdateInput, GameUncheckedUpdateInput>
    /**
     * Choose, which Game to update.
     */
    where: GameWhereUniqueInput
  }

  /**
   * Game updateMany
   */
  export type GameUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Games.
     */
    data: XOR<GameUpdateManyMutationInput, GameUncheckedUpdateManyInput>
    /**
     * Filter which Games to update
     */
    where?: GameWhereInput
  }

  /**
   * Game upsert
   */
  export type GameUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * The filter to search for the Game to update in case it exists.
     */
    where: GameWhereUniqueInput
    /**
     * In case the Game found by the `where` argument doesn't exist, create a new Game with this data.
     */
    create: XOR<GameCreateInput, GameUncheckedCreateInput>
    /**
     * In case the Game was found with the provided `where` argument, update it with this data.
     */
    update: XOR<GameUpdateInput, GameUncheckedUpdateInput>
  }

  /**
   * Game delete
   */
  export type GameDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    /**
     * Filter which Game to delete.
     */
    where: GameWhereUniqueInput
  }

  /**
   * Game deleteMany
   */
  export type GameDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Games to delete
     */
    where?: GameWhereInput
  }

  /**
   * Game.players
   */
  export type Game$playersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    where?: PlayerWhereInput
    orderBy?: PlayerOrderByWithRelationInput | PlayerOrderByWithRelationInput[]
    cursor?: PlayerWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PlayerScalarFieldEnum | PlayerScalarFieldEnum[]
  }

  /**
   * Game.matches
   */
  export type Game$matchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    where?: MatchWhereInput
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    cursor?: MatchWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchScalarFieldEnum | MatchScalarFieldEnum[]
  }

  /**
   * Game.characters
   */
  export type Game$charactersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    where?: CharacterWhereInput
    orderBy?: CharacterOrderByWithRelationInput | CharacterOrderByWithRelationInput[]
    cursor?: CharacterWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CharacterScalarFieldEnum | CharacterScalarFieldEnum[]
  }

  /**
   * Game.maps
   */
  export type Game$mapsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    where?: MapWhereInput
    orderBy?: MapOrderByWithRelationInput | MapOrderByWithRelationInput[]
    cursor?: MapWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MapScalarFieldEnum | MapScalarFieldEnum[]
  }

  /**
   * Game.gameModes
   */
  export type Game$gameModesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    where?: GameModeWhereInput
    orderBy?: GameModeOrderByWithRelationInput | GameModeOrderByWithRelationInput[]
    cursor?: GameModeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: GameModeScalarFieldEnum | GameModeScalarFieldEnum[]
  }

  /**
   * Game.playerStats
   */
  export type Game$playerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    where?: PlayerStatsWhereInput
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    cursor?: PlayerStatsWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PlayerStatsScalarFieldEnum | PlayerStatsScalarFieldEnum[]
  }

  /**
   * Game.jobQueue
   */
  export type Game$jobQueueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    where?: JobQueueWhereInput
    orderBy?: JobQueueOrderByWithRelationInput | JobQueueOrderByWithRelationInput[]
    cursor?: JobQueueWhereUniqueInput
    take?: number
    skip?: number
    distinct?: JobQueueScalarFieldEnum | JobQueueScalarFieldEnum[]
  }

  /**
   * Game without action
   */
  export type GameDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
  }


  /**
   * Model Player
   */

  export type AggregatePlayer = {
    _count: PlayerCountAggregateOutputType | null
    _min: PlayerMinAggregateOutputType | null
    _max: PlayerMaxAggregateOutputType | null
  }

  export type PlayerMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    username: string | null
    displayName: string | null
    userId: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PlayerMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    username: string | null
    displayName: string | null
    userId: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PlayerCountAggregateOutputType = {
    id: number
    gameId: number
    username: number
    displayName: number
    userId: number
    isActive: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PlayerMinAggregateInputType = {
    id?: true
    gameId?: true
    username?: true
    displayName?: true
    userId?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PlayerMaxAggregateInputType = {
    id?: true
    gameId?: true
    username?: true
    displayName?: true
    userId?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PlayerCountAggregateInputType = {
    id?: true
    gameId?: true
    username?: true
    displayName?: true
    userId?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PlayerAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Player to aggregate.
     */
    where?: PlayerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Players to fetch.
     */
    orderBy?: PlayerOrderByWithRelationInput | PlayerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PlayerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Players from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Players.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Players
    **/
    _count?: true | PlayerCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PlayerMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PlayerMaxAggregateInputType
  }

  export type GetPlayerAggregateType<T extends PlayerAggregateArgs> = {
        [P in keyof T & keyof AggregatePlayer]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePlayer[P]>
      : GetScalarType<T[P], AggregatePlayer[P]>
  }




  export type PlayerGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlayerWhereInput
    orderBy?: PlayerOrderByWithAggregationInput | PlayerOrderByWithAggregationInput[]
    by: PlayerScalarFieldEnum[] | PlayerScalarFieldEnum
    having?: PlayerScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PlayerCountAggregateInputType | true
    _min?: PlayerMinAggregateInputType
    _max?: PlayerMaxAggregateInputType
  }

  export type PlayerGroupByOutputType = {
    id: string
    gameId: string
    username: string
    displayName: string | null
    userId: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    _count: PlayerCountAggregateOutputType | null
    _min: PlayerMinAggregateOutputType | null
    _max: PlayerMaxAggregateOutputType | null
  }

  type GetPlayerGroupByPayload<T extends PlayerGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PlayerGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PlayerGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PlayerGroupByOutputType[P]>
            : GetScalarType<T[P], PlayerGroupByOutputType[P]>
        }
      >
    >


  export type PlayerSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    username?: boolean
    displayName?: boolean
    userId?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    playerStats?: boolean | Player$playerStatsArgs<ExtArgs>
    matchResults?: boolean | Player$matchResultsArgs<ExtArgs>
    _count?: boolean | PlayerCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["player"]>

  export type PlayerSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    username?: boolean
    displayName?: boolean
    userId?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["player"]>

  export type PlayerSelectScalar = {
    id?: boolean
    gameId?: boolean
    username?: boolean
    displayName?: boolean
    userId?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type PlayerInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    playerStats?: boolean | Player$playerStatsArgs<ExtArgs>
    matchResults?: boolean | Player$matchResultsArgs<ExtArgs>
    _count?: boolean | PlayerCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type PlayerIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
  }

  export type $PlayerPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Player"
    objects: {
      game: Prisma.$GamePayload<ExtArgs>
      playerStats: Prisma.$PlayerStatsPayload<ExtArgs>[]
      matchResults: Prisma.$MatchResultPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string
      username: string
      displayName: string | null
      userId: string | null
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["player"]>
    composites: {}
  }

  type PlayerGetPayload<S extends boolean | null | undefined | PlayerDefaultArgs> = $Result.GetResult<Prisma.$PlayerPayload, S>

  type PlayerCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<PlayerFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: PlayerCountAggregateInputType | true
    }

  export interface PlayerDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Player'], meta: { name: 'Player' } }
    /**
     * Find zero or one Player that matches the filter.
     * @param {PlayerFindUniqueArgs} args - Arguments to find a Player
     * @example
     * // Get one Player
     * const player = await prisma.player.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PlayerFindUniqueArgs>(args: SelectSubset<T, PlayerFindUniqueArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Player that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {PlayerFindUniqueOrThrowArgs} args - Arguments to find a Player
     * @example
     * // Get one Player
     * const player = await prisma.player.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PlayerFindUniqueOrThrowArgs>(args: SelectSubset<T, PlayerFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Player that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerFindFirstArgs} args - Arguments to find a Player
     * @example
     * // Get one Player
     * const player = await prisma.player.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PlayerFindFirstArgs>(args?: SelectSubset<T, PlayerFindFirstArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Player that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerFindFirstOrThrowArgs} args - Arguments to find a Player
     * @example
     * // Get one Player
     * const player = await prisma.player.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PlayerFindFirstOrThrowArgs>(args?: SelectSubset<T, PlayerFindFirstOrThrowArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Players that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Players
     * const players = await prisma.player.findMany()
     * 
     * // Get first 10 Players
     * const players = await prisma.player.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const playerWithIdOnly = await prisma.player.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PlayerFindManyArgs>(args?: SelectSubset<T, PlayerFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Player.
     * @param {PlayerCreateArgs} args - Arguments to create a Player.
     * @example
     * // Create one Player
     * const Player = await prisma.player.create({
     *   data: {
     *     // ... data to create a Player
     *   }
     * })
     * 
     */
    create<T extends PlayerCreateArgs>(args: SelectSubset<T, PlayerCreateArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Players.
     * @param {PlayerCreateManyArgs} args - Arguments to create many Players.
     * @example
     * // Create many Players
     * const player = await prisma.player.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PlayerCreateManyArgs>(args?: SelectSubset<T, PlayerCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Players and returns the data saved in the database.
     * @param {PlayerCreateManyAndReturnArgs} args - Arguments to create many Players.
     * @example
     * // Create many Players
     * const player = await prisma.player.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Players and only return the `id`
     * const playerWithIdOnly = await prisma.player.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PlayerCreateManyAndReturnArgs>(args?: SelectSubset<T, PlayerCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Player.
     * @param {PlayerDeleteArgs} args - Arguments to delete one Player.
     * @example
     * // Delete one Player
     * const Player = await prisma.player.delete({
     *   where: {
     *     // ... filter to delete one Player
     *   }
     * })
     * 
     */
    delete<T extends PlayerDeleteArgs>(args: SelectSubset<T, PlayerDeleteArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Player.
     * @param {PlayerUpdateArgs} args - Arguments to update one Player.
     * @example
     * // Update one Player
     * const player = await prisma.player.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PlayerUpdateArgs>(args: SelectSubset<T, PlayerUpdateArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Players.
     * @param {PlayerDeleteManyArgs} args - Arguments to filter Players to delete.
     * @example
     * // Delete a few Players
     * const { count } = await prisma.player.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PlayerDeleteManyArgs>(args?: SelectSubset<T, PlayerDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Players.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Players
     * const player = await prisma.player.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PlayerUpdateManyArgs>(args: SelectSubset<T, PlayerUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Player.
     * @param {PlayerUpsertArgs} args - Arguments to update or create a Player.
     * @example
     * // Update or create a Player
     * const player = await prisma.player.upsert({
     *   create: {
     *     // ... data to create a Player
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Player we want to update
     *   }
     * })
     */
    upsert<T extends PlayerUpsertArgs>(args: SelectSubset<T, PlayerUpsertArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Players.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerCountArgs} args - Arguments to filter Players to count.
     * @example
     * // Count the number of Players
     * const count = await prisma.player.count({
     *   where: {
     *     // ... the filter for the Players we want to count
     *   }
     * })
    **/
    count<T extends PlayerCountArgs>(
      args?: Subset<T, PlayerCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PlayerCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Player.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PlayerAggregateArgs>(args: Subset<T, PlayerAggregateArgs>): Prisma.PrismaPromise<GetPlayerAggregateType<T>>

    /**
     * Group by Player.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PlayerGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PlayerGroupByArgs['orderBy'] }
        : { orderBy?: PlayerGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PlayerGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPlayerGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Player model
   */
  readonly fields: PlayerFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Player.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PlayerClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends GameDefaultArgs<ExtArgs> = {}>(args?: Subset<T, GameDefaultArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    playerStats<T extends Player$playerStatsArgs<ExtArgs> = {}>(args?: Subset<T, Player$playerStatsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findMany"> | Null>
    matchResults<T extends Player$matchResultsArgs<ExtArgs> = {}>(args?: Subset<T, Player$matchResultsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Player model
   */ 
  interface PlayerFieldRefs {
    readonly id: FieldRef<"Player", 'String'>
    readonly gameId: FieldRef<"Player", 'String'>
    readonly username: FieldRef<"Player", 'String'>
    readonly displayName: FieldRef<"Player", 'String'>
    readonly userId: FieldRef<"Player", 'String'>
    readonly isActive: FieldRef<"Player", 'Boolean'>
    readonly createdAt: FieldRef<"Player", 'DateTime'>
    readonly updatedAt: FieldRef<"Player", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Player findUnique
   */
  export type PlayerFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * Filter, which Player to fetch.
     */
    where: PlayerWhereUniqueInput
  }

  /**
   * Player findUniqueOrThrow
   */
  export type PlayerFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * Filter, which Player to fetch.
     */
    where: PlayerWhereUniqueInput
  }

  /**
   * Player findFirst
   */
  export type PlayerFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * Filter, which Player to fetch.
     */
    where?: PlayerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Players to fetch.
     */
    orderBy?: PlayerOrderByWithRelationInput | PlayerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Players.
     */
    cursor?: PlayerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Players from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Players.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Players.
     */
    distinct?: PlayerScalarFieldEnum | PlayerScalarFieldEnum[]
  }

  /**
   * Player findFirstOrThrow
   */
  export type PlayerFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * Filter, which Player to fetch.
     */
    where?: PlayerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Players to fetch.
     */
    orderBy?: PlayerOrderByWithRelationInput | PlayerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Players.
     */
    cursor?: PlayerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Players from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Players.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Players.
     */
    distinct?: PlayerScalarFieldEnum | PlayerScalarFieldEnum[]
  }

  /**
   * Player findMany
   */
  export type PlayerFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * Filter, which Players to fetch.
     */
    where?: PlayerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Players to fetch.
     */
    orderBy?: PlayerOrderByWithRelationInput | PlayerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Players.
     */
    cursor?: PlayerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Players from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Players.
     */
    skip?: number
    distinct?: PlayerScalarFieldEnum | PlayerScalarFieldEnum[]
  }

  /**
   * Player create
   */
  export type PlayerCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * The data needed to create a Player.
     */
    data: XOR<PlayerCreateInput, PlayerUncheckedCreateInput>
  }

  /**
   * Player createMany
   */
  export type PlayerCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Players.
     */
    data: PlayerCreateManyInput | PlayerCreateManyInput[]
  }

  /**
   * Player createManyAndReturn
   */
  export type PlayerCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Players.
     */
    data: PlayerCreateManyInput | PlayerCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Player update
   */
  export type PlayerUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * The data needed to update a Player.
     */
    data: XOR<PlayerUpdateInput, PlayerUncheckedUpdateInput>
    /**
     * Choose, which Player to update.
     */
    where: PlayerWhereUniqueInput
  }

  /**
   * Player updateMany
   */
  export type PlayerUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Players.
     */
    data: XOR<PlayerUpdateManyMutationInput, PlayerUncheckedUpdateManyInput>
    /**
     * Filter which Players to update
     */
    where?: PlayerWhereInput
  }

  /**
   * Player upsert
   */
  export type PlayerUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * The filter to search for the Player to update in case it exists.
     */
    where: PlayerWhereUniqueInput
    /**
     * In case the Player found by the `where` argument doesn't exist, create a new Player with this data.
     */
    create: XOR<PlayerCreateInput, PlayerUncheckedCreateInput>
    /**
     * In case the Player was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PlayerUpdateInput, PlayerUncheckedUpdateInput>
  }

  /**
   * Player delete
   */
  export type PlayerDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
    /**
     * Filter which Player to delete.
     */
    where: PlayerWhereUniqueInput
  }

  /**
   * Player deleteMany
   */
  export type PlayerDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Players to delete
     */
    where?: PlayerWhereInput
  }

  /**
   * Player.playerStats
   */
  export type Player$playerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    where?: PlayerStatsWhereInput
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    cursor?: PlayerStatsWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PlayerStatsScalarFieldEnum | PlayerStatsScalarFieldEnum[]
  }

  /**
   * Player.matchResults
   */
  export type Player$matchResultsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    where?: MatchResultWhereInput
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    cursor?: MatchResultWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchResultScalarFieldEnum | MatchResultScalarFieldEnum[]
  }

  /**
   * Player without action
   */
  export type PlayerDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Player
     */
    select?: PlayerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerInclude<ExtArgs> | null
  }


  /**
   * Model Character
   */

  export type AggregateCharacter = {
    _count: CharacterCountAggregateOutputType | null
    _min: CharacterMinAggregateOutputType | null
    _max: CharacterMaxAggregateOutputType | null
  }

  export type CharacterMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    name: string | null
    displayName: string | null
    role: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CharacterMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    name: string | null
    displayName: string | null
    role: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CharacterCountAggregateOutputType = {
    id: number
    gameId: number
    name: number
    displayName: number
    role: number
    isActive: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type CharacterMinAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    role?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CharacterMaxAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    role?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CharacterCountAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    role?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type CharacterAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Character to aggregate.
     */
    where?: CharacterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Characters to fetch.
     */
    orderBy?: CharacterOrderByWithRelationInput | CharacterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CharacterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Characters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Characters.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Characters
    **/
    _count?: true | CharacterCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CharacterMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CharacterMaxAggregateInputType
  }

  export type GetCharacterAggregateType<T extends CharacterAggregateArgs> = {
        [P in keyof T & keyof AggregateCharacter]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCharacter[P]>
      : GetScalarType<T[P], AggregateCharacter[P]>
  }




  export type CharacterGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CharacterWhereInput
    orderBy?: CharacterOrderByWithAggregationInput | CharacterOrderByWithAggregationInput[]
    by: CharacterScalarFieldEnum[] | CharacterScalarFieldEnum
    having?: CharacterScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CharacterCountAggregateInputType | true
    _min?: CharacterMinAggregateInputType
    _max?: CharacterMaxAggregateInputType
  }

  export type CharacterGroupByOutputType = {
    id: string
    gameId: string
    name: string
    displayName: string
    role: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    _count: CharacterCountAggregateOutputType | null
    _min: CharacterMinAggregateOutputType | null
    _max: CharacterMaxAggregateOutputType | null
  }

  type GetCharacterGroupByPayload<T extends CharacterGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CharacterGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CharacterGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CharacterGroupByOutputType[P]>
            : GetScalarType<T[P], CharacterGroupByOutputType[P]>
        }
      >
    >


  export type CharacterSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    role?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    matchResults?: boolean | Character$matchResultsArgs<ExtArgs>
    _count?: boolean | CharacterCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["character"]>

  export type CharacterSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    role?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["character"]>

  export type CharacterSelectScalar = {
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    role?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type CharacterInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    matchResults?: boolean | Character$matchResultsArgs<ExtArgs>
    _count?: boolean | CharacterCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CharacterIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
  }

  export type $CharacterPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Character"
    objects: {
      game: Prisma.$GamePayload<ExtArgs>
      matchResults: Prisma.$MatchResultPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string
      name: string
      displayName: string
      role: string
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["character"]>
    composites: {}
  }

  type CharacterGetPayload<S extends boolean | null | undefined | CharacterDefaultArgs> = $Result.GetResult<Prisma.$CharacterPayload, S>

  type CharacterCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<CharacterFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: CharacterCountAggregateInputType | true
    }

  export interface CharacterDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Character'], meta: { name: 'Character' } }
    /**
     * Find zero or one Character that matches the filter.
     * @param {CharacterFindUniqueArgs} args - Arguments to find a Character
     * @example
     * // Get one Character
     * const character = await prisma.character.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CharacterFindUniqueArgs>(args: SelectSubset<T, CharacterFindUniqueArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Character that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {CharacterFindUniqueOrThrowArgs} args - Arguments to find a Character
     * @example
     * // Get one Character
     * const character = await prisma.character.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CharacterFindUniqueOrThrowArgs>(args: SelectSubset<T, CharacterFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Character that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterFindFirstArgs} args - Arguments to find a Character
     * @example
     * // Get one Character
     * const character = await prisma.character.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CharacterFindFirstArgs>(args?: SelectSubset<T, CharacterFindFirstArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Character that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterFindFirstOrThrowArgs} args - Arguments to find a Character
     * @example
     * // Get one Character
     * const character = await prisma.character.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CharacterFindFirstOrThrowArgs>(args?: SelectSubset<T, CharacterFindFirstOrThrowArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Characters that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Characters
     * const characters = await prisma.character.findMany()
     * 
     * // Get first 10 Characters
     * const characters = await prisma.character.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const characterWithIdOnly = await prisma.character.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CharacterFindManyArgs>(args?: SelectSubset<T, CharacterFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Character.
     * @param {CharacterCreateArgs} args - Arguments to create a Character.
     * @example
     * // Create one Character
     * const Character = await prisma.character.create({
     *   data: {
     *     // ... data to create a Character
     *   }
     * })
     * 
     */
    create<T extends CharacterCreateArgs>(args: SelectSubset<T, CharacterCreateArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Characters.
     * @param {CharacterCreateManyArgs} args - Arguments to create many Characters.
     * @example
     * // Create many Characters
     * const character = await prisma.character.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CharacterCreateManyArgs>(args?: SelectSubset<T, CharacterCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Characters and returns the data saved in the database.
     * @param {CharacterCreateManyAndReturnArgs} args - Arguments to create many Characters.
     * @example
     * // Create many Characters
     * const character = await prisma.character.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Characters and only return the `id`
     * const characterWithIdOnly = await prisma.character.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CharacterCreateManyAndReturnArgs>(args?: SelectSubset<T, CharacterCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Character.
     * @param {CharacterDeleteArgs} args - Arguments to delete one Character.
     * @example
     * // Delete one Character
     * const Character = await prisma.character.delete({
     *   where: {
     *     // ... filter to delete one Character
     *   }
     * })
     * 
     */
    delete<T extends CharacterDeleteArgs>(args: SelectSubset<T, CharacterDeleteArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Character.
     * @param {CharacterUpdateArgs} args - Arguments to update one Character.
     * @example
     * // Update one Character
     * const character = await prisma.character.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CharacterUpdateArgs>(args: SelectSubset<T, CharacterUpdateArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Characters.
     * @param {CharacterDeleteManyArgs} args - Arguments to filter Characters to delete.
     * @example
     * // Delete a few Characters
     * const { count } = await prisma.character.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CharacterDeleteManyArgs>(args?: SelectSubset<T, CharacterDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Characters.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Characters
     * const character = await prisma.character.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CharacterUpdateManyArgs>(args: SelectSubset<T, CharacterUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Character.
     * @param {CharacterUpsertArgs} args - Arguments to update or create a Character.
     * @example
     * // Update or create a Character
     * const character = await prisma.character.upsert({
     *   create: {
     *     // ... data to create a Character
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Character we want to update
     *   }
     * })
     */
    upsert<T extends CharacterUpsertArgs>(args: SelectSubset<T, CharacterUpsertArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Characters.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterCountArgs} args - Arguments to filter Characters to count.
     * @example
     * // Count the number of Characters
     * const count = await prisma.character.count({
     *   where: {
     *     // ... the filter for the Characters we want to count
     *   }
     * })
    **/
    count<T extends CharacterCountArgs>(
      args?: Subset<T, CharacterCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CharacterCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Character.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CharacterAggregateArgs>(args: Subset<T, CharacterAggregateArgs>): Prisma.PrismaPromise<GetCharacterAggregateType<T>>

    /**
     * Group by Character.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CharacterGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CharacterGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CharacterGroupByArgs['orderBy'] }
        : { orderBy?: CharacterGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CharacterGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCharacterGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Character model
   */
  readonly fields: CharacterFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Character.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CharacterClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends GameDefaultArgs<ExtArgs> = {}>(args?: Subset<T, GameDefaultArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    matchResults<T extends Character$matchResultsArgs<ExtArgs> = {}>(args?: Subset<T, Character$matchResultsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Character model
   */ 
  interface CharacterFieldRefs {
    readonly id: FieldRef<"Character", 'String'>
    readonly gameId: FieldRef<"Character", 'String'>
    readonly name: FieldRef<"Character", 'String'>
    readonly displayName: FieldRef<"Character", 'String'>
    readonly role: FieldRef<"Character", 'String'>
    readonly isActive: FieldRef<"Character", 'Boolean'>
    readonly createdAt: FieldRef<"Character", 'DateTime'>
    readonly updatedAt: FieldRef<"Character", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Character findUnique
   */
  export type CharacterFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * Filter, which Character to fetch.
     */
    where: CharacterWhereUniqueInput
  }

  /**
   * Character findUniqueOrThrow
   */
  export type CharacterFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * Filter, which Character to fetch.
     */
    where: CharacterWhereUniqueInput
  }

  /**
   * Character findFirst
   */
  export type CharacterFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * Filter, which Character to fetch.
     */
    where?: CharacterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Characters to fetch.
     */
    orderBy?: CharacterOrderByWithRelationInput | CharacterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Characters.
     */
    cursor?: CharacterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Characters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Characters.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Characters.
     */
    distinct?: CharacterScalarFieldEnum | CharacterScalarFieldEnum[]
  }

  /**
   * Character findFirstOrThrow
   */
  export type CharacterFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * Filter, which Character to fetch.
     */
    where?: CharacterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Characters to fetch.
     */
    orderBy?: CharacterOrderByWithRelationInput | CharacterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Characters.
     */
    cursor?: CharacterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Characters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Characters.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Characters.
     */
    distinct?: CharacterScalarFieldEnum | CharacterScalarFieldEnum[]
  }

  /**
   * Character findMany
   */
  export type CharacterFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * Filter, which Characters to fetch.
     */
    where?: CharacterWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Characters to fetch.
     */
    orderBy?: CharacterOrderByWithRelationInput | CharacterOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Characters.
     */
    cursor?: CharacterWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Characters from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Characters.
     */
    skip?: number
    distinct?: CharacterScalarFieldEnum | CharacterScalarFieldEnum[]
  }

  /**
   * Character create
   */
  export type CharacterCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * The data needed to create a Character.
     */
    data: XOR<CharacterCreateInput, CharacterUncheckedCreateInput>
  }

  /**
   * Character createMany
   */
  export type CharacterCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Characters.
     */
    data: CharacterCreateManyInput | CharacterCreateManyInput[]
  }

  /**
   * Character createManyAndReturn
   */
  export type CharacterCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Characters.
     */
    data: CharacterCreateManyInput | CharacterCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Character update
   */
  export type CharacterUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * The data needed to update a Character.
     */
    data: XOR<CharacterUpdateInput, CharacterUncheckedUpdateInput>
    /**
     * Choose, which Character to update.
     */
    where: CharacterWhereUniqueInput
  }

  /**
   * Character updateMany
   */
  export type CharacterUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Characters.
     */
    data: XOR<CharacterUpdateManyMutationInput, CharacterUncheckedUpdateManyInput>
    /**
     * Filter which Characters to update
     */
    where?: CharacterWhereInput
  }

  /**
   * Character upsert
   */
  export type CharacterUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * The filter to search for the Character to update in case it exists.
     */
    where: CharacterWhereUniqueInput
    /**
     * In case the Character found by the `where` argument doesn't exist, create a new Character with this data.
     */
    create: XOR<CharacterCreateInput, CharacterUncheckedCreateInput>
    /**
     * In case the Character was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CharacterUpdateInput, CharacterUncheckedUpdateInput>
  }

  /**
   * Character delete
   */
  export type CharacterDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    /**
     * Filter which Character to delete.
     */
    where: CharacterWhereUniqueInput
  }

  /**
   * Character deleteMany
   */
  export type CharacterDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Characters to delete
     */
    where?: CharacterWhereInput
  }

  /**
   * Character.matchResults
   */
  export type Character$matchResultsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    where?: MatchResultWhereInput
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    cursor?: MatchResultWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchResultScalarFieldEnum | MatchResultScalarFieldEnum[]
  }

  /**
   * Character without action
   */
  export type CharacterDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
  }


  /**
   * Model Map
   */

  export type AggregateMap = {
    _count: MapCountAggregateOutputType | null
    _min: MapMinAggregateOutputType | null
    _max: MapMaxAggregateOutputType | null
  }

  export type MapMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    name: string | null
    displayName: string | null
    mapType: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MapMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    name: string | null
    displayName: string | null
    mapType: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MapCountAggregateOutputType = {
    id: number
    gameId: number
    name: number
    displayName: number
    mapType: number
    isActive: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type MapMinAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    mapType?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MapMaxAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    mapType?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MapCountAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    mapType?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type MapAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Map to aggregate.
     */
    where?: MapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Maps to fetch.
     */
    orderBy?: MapOrderByWithRelationInput | MapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: MapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Maps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Maps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Maps
    **/
    _count?: true | MapCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: MapMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: MapMaxAggregateInputType
  }

  export type GetMapAggregateType<T extends MapAggregateArgs> = {
        [P in keyof T & keyof AggregateMap]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateMap[P]>
      : GetScalarType<T[P], AggregateMap[P]>
  }




  export type MapGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MapWhereInput
    orderBy?: MapOrderByWithAggregationInput | MapOrderByWithAggregationInput[]
    by: MapScalarFieldEnum[] | MapScalarFieldEnum
    having?: MapScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: MapCountAggregateInputType | true
    _min?: MapMinAggregateInputType
    _max?: MapMaxAggregateInputType
  }

  export type MapGroupByOutputType = {
    id: string
    gameId: string
    name: string
    displayName: string
    mapType: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    _count: MapCountAggregateOutputType | null
    _min: MapMinAggregateOutputType | null
    _max: MapMaxAggregateOutputType | null
  }

  type GetMapGroupByPayload<T extends MapGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<MapGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof MapGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], MapGroupByOutputType[P]>
            : GetScalarType<T[P], MapGroupByOutputType[P]>
        }
      >
    >


  export type MapSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    mapType?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    matches?: boolean | Map$matchesArgs<ExtArgs>
    _count?: boolean | MapCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["map"]>

  export type MapSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    mapType?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["map"]>

  export type MapSelectScalar = {
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    mapType?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type MapInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    matches?: boolean | Map$matchesArgs<ExtArgs>
    _count?: boolean | MapCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type MapIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
  }

  export type $MapPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Map"
    objects: {
      game: Prisma.$GamePayload<ExtArgs>
      matches: Prisma.$MatchPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string
      name: string
      displayName: string
      mapType: string
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["map"]>
    composites: {}
  }

  type MapGetPayload<S extends boolean | null | undefined | MapDefaultArgs> = $Result.GetResult<Prisma.$MapPayload, S>

  type MapCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<MapFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: MapCountAggregateInputType | true
    }

  export interface MapDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Map'], meta: { name: 'Map' } }
    /**
     * Find zero or one Map that matches the filter.
     * @param {MapFindUniqueArgs} args - Arguments to find a Map
     * @example
     * // Get one Map
     * const map = await prisma.map.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends MapFindUniqueArgs>(args: SelectSubset<T, MapFindUniqueArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Map that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {MapFindUniqueOrThrowArgs} args - Arguments to find a Map
     * @example
     * // Get one Map
     * const map = await prisma.map.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends MapFindUniqueOrThrowArgs>(args: SelectSubset<T, MapFindUniqueOrThrowArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Map that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapFindFirstArgs} args - Arguments to find a Map
     * @example
     * // Get one Map
     * const map = await prisma.map.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends MapFindFirstArgs>(args?: SelectSubset<T, MapFindFirstArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Map that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapFindFirstOrThrowArgs} args - Arguments to find a Map
     * @example
     * // Get one Map
     * const map = await prisma.map.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends MapFindFirstOrThrowArgs>(args?: SelectSubset<T, MapFindFirstOrThrowArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Maps that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Maps
     * const maps = await prisma.map.findMany()
     * 
     * // Get first 10 Maps
     * const maps = await prisma.map.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const mapWithIdOnly = await prisma.map.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends MapFindManyArgs>(args?: SelectSubset<T, MapFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Map.
     * @param {MapCreateArgs} args - Arguments to create a Map.
     * @example
     * // Create one Map
     * const Map = await prisma.map.create({
     *   data: {
     *     // ... data to create a Map
     *   }
     * })
     * 
     */
    create<T extends MapCreateArgs>(args: SelectSubset<T, MapCreateArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Maps.
     * @param {MapCreateManyArgs} args - Arguments to create many Maps.
     * @example
     * // Create many Maps
     * const map = await prisma.map.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends MapCreateManyArgs>(args?: SelectSubset<T, MapCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Maps and returns the data saved in the database.
     * @param {MapCreateManyAndReturnArgs} args - Arguments to create many Maps.
     * @example
     * // Create many Maps
     * const map = await prisma.map.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Maps and only return the `id`
     * const mapWithIdOnly = await prisma.map.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends MapCreateManyAndReturnArgs>(args?: SelectSubset<T, MapCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Map.
     * @param {MapDeleteArgs} args - Arguments to delete one Map.
     * @example
     * // Delete one Map
     * const Map = await prisma.map.delete({
     *   where: {
     *     // ... filter to delete one Map
     *   }
     * })
     * 
     */
    delete<T extends MapDeleteArgs>(args: SelectSubset<T, MapDeleteArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Map.
     * @param {MapUpdateArgs} args - Arguments to update one Map.
     * @example
     * // Update one Map
     * const map = await prisma.map.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends MapUpdateArgs>(args: SelectSubset<T, MapUpdateArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Maps.
     * @param {MapDeleteManyArgs} args - Arguments to filter Maps to delete.
     * @example
     * // Delete a few Maps
     * const { count } = await prisma.map.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends MapDeleteManyArgs>(args?: SelectSubset<T, MapDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Maps.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Maps
     * const map = await prisma.map.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends MapUpdateManyArgs>(args: SelectSubset<T, MapUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Map.
     * @param {MapUpsertArgs} args - Arguments to update or create a Map.
     * @example
     * // Update or create a Map
     * const map = await prisma.map.upsert({
     *   create: {
     *     // ... data to create a Map
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Map we want to update
     *   }
     * })
     */
    upsert<T extends MapUpsertArgs>(args: SelectSubset<T, MapUpsertArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Maps.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapCountArgs} args - Arguments to filter Maps to count.
     * @example
     * // Count the number of Maps
     * const count = await prisma.map.count({
     *   where: {
     *     // ... the filter for the Maps we want to count
     *   }
     * })
    **/
    count<T extends MapCountArgs>(
      args?: Subset<T, MapCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], MapCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Map.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends MapAggregateArgs>(args: Subset<T, MapAggregateArgs>): Prisma.PrismaPromise<GetMapAggregateType<T>>

    /**
     * Group by Map.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MapGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends MapGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: MapGroupByArgs['orderBy'] }
        : { orderBy?: MapGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, MapGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetMapGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Map model
   */
  readonly fields: MapFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Map.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__MapClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends GameDefaultArgs<ExtArgs> = {}>(args?: Subset<T, GameDefaultArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    matches<T extends Map$matchesArgs<ExtArgs> = {}>(args?: Subset<T, Map$matchesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Map model
   */ 
  interface MapFieldRefs {
    readonly id: FieldRef<"Map", 'String'>
    readonly gameId: FieldRef<"Map", 'String'>
    readonly name: FieldRef<"Map", 'String'>
    readonly displayName: FieldRef<"Map", 'String'>
    readonly mapType: FieldRef<"Map", 'String'>
    readonly isActive: FieldRef<"Map", 'Boolean'>
    readonly createdAt: FieldRef<"Map", 'DateTime'>
    readonly updatedAt: FieldRef<"Map", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Map findUnique
   */
  export type MapFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * Filter, which Map to fetch.
     */
    where: MapWhereUniqueInput
  }

  /**
   * Map findUniqueOrThrow
   */
  export type MapFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * Filter, which Map to fetch.
     */
    where: MapWhereUniqueInput
  }

  /**
   * Map findFirst
   */
  export type MapFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * Filter, which Map to fetch.
     */
    where?: MapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Maps to fetch.
     */
    orderBy?: MapOrderByWithRelationInput | MapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Maps.
     */
    cursor?: MapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Maps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Maps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Maps.
     */
    distinct?: MapScalarFieldEnum | MapScalarFieldEnum[]
  }

  /**
   * Map findFirstOrThrow
   */
  export type MapFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * Filter, which Map to fetch.
     */
    where?: MapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Maps to fetch.
     */
    orderBy?: MapOrderByWithRelationInput | MapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Maps.
     */
    cursor?: MapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Maps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Maps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Maps.
     */
    distinct?: MapScalarFieldEnum | MapScalarFieldEnum[]
  }

  /**
   * Map findMany
   */
  export type MapFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * Filter, which Maps to fetch.
     */
    where?: MapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Maps to fetch.
     */
    orderBy?: MapOrderByWithRelationInput | MapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Maps.
     */
    cursor?: MapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Maps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Maps.
     */
    skip?: number
    distinct?: MapScalarFieldEnum | MapScalarFieldEnum[]
  }

  /**
   * Map create
   */
  export type MapCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * The data needed to create a Map.
     */
    data: XOR<MapCreateInput, MapUncheckedCreateInput>
  }

  /**
   * Map createMany
   */
  export type MapCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Maps.
     */
    data: MapCreateManyInput | MapCreateManyInput[]
  }

  /**
   * Map createManyAndReturn
   */
  export type MapCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Maps.
     */
    data: MapCreateManyInput | MapCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Map update
   */
  export type MapUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * The data needed to update a Map.
     */
    data: XOR<MapUpdateInput, MapUncheckedUpdateInput>
    /**
     * Choose, which Map to update.
     */
    where: MapWhereUniqueInput
  }

  /**
   * Map updateMany
   */
  export type MapUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Maps.
     */
    data: XOR<MapUpdateManyMutationInput, MapUncheckedUpdateManyInput>
    /**
     * Filter which Maps to update
     */
    where?: MapWhereInput
  }

  /**
   * Map upsert
   */
  export type MapUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * The filter to search for the Map to update in case it exists.
     */
    where: MapWhereUniqueInput
    /**
     * In case the Map found by the `where` argument doesn't exist, create a new Map with this data.
     */
    create: XOR<MapCreateInput, MapUncheckedCreateInput>
    /**
     * In case the Map was found with the provided `where` argument, update it with this data.
     */
    update: XOR<MapUpdateInput, MapUncheckedUpdateInput>
  }

  /**
   * Map delete
   */
  export type MapDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    /**
     * Filter which Map to delete.
     */
    where: MapWhereUniqueInput
  }

  /**
   * Map deleteMany
   */
  export type MapDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Maps to delete
     */
    where?: MapWhereInput
  }

  /**
   * Map.matches
   */
  export type Map$matchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    where?: MatchWhereInput
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    cursor?: MatchWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchScalarFieldEnum | MatchScalarFieldEnum[]
  }

  /**
   * Map without action
   */
  export type MapDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
  }


  /**
   * Model GameMode
   */

  export type AggregateGameMode = {
    _count: GameModeCountAggregateOutputType | null
    _min: GameModeMinAggregateOutputType | null
    _max: GameModeMaxAggregateOutputType | null
  }

  export type GameModeMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    name: string | null
    displayName: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GameModeMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    name: string | null
    displayName: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GameModeCountAggregateOutputType = {
    id: number
    gameId: number
    name: number
    displayName: number
    isActive: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type GameModeMinAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GameModeMaxAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GameModeCountAggregateInputType = {
    id?: true
    gameId?: true
    name?: true
    displayName?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type GameModeAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which GameMode to aggregate.
     */
    where?: GameModeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameModes to fetch.
     */
    orderBy?: GameModeOrderByWithRelationInput | GameModeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: GameModeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameModes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameModes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned GameModes
    **/
    _count?: true | GameModeCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: GameModeMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: GameModeMaxAggregateInputType
  }

  export type GetGameModeAggregateType<T extends GameModeAggregateArgs> = {
        [P in keyof T & keyof AggregateGameMode]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateGameMode[P]>
      : GetScalarType<T[P], AggregateGameMode[P]>
  }




  export type GameModeGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GameModeWhereInput
    orderBy?: GameModeOrderByWithAggregationInput | GameModeOrderByWithAggregationInput[]
    by: GameModeScalarFieldEnum[] | GameModeScalarFieldEnum
    having?: GameModeScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: GameModeCountAggregateInputType | true
    _min?: GameModeMinAggregateInputType
    _max?: GameModeMaxAggregateInputType
  }

  export type GameModeGroupByOutputType = {
    id: string
    gameId: string
    name: string
    displayName: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    _count: GameModeCountAggregateOutputType | null
    _min: GameModeMinAggregateOutputType | null
    _max: GameModeMaxAggregateOutputType | null
  }

  type GetGameModeGroupByPayload<T extends GameModeGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<GameModeGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof GameModeGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], GameModeGroupByOutputType[P]>
            : GetScalarType<T[P], GameModeGroupByOutputType[P]>
        }
      >
    >


  export type GameModeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    matches?: boolean | GameMode$matchesArgs<ExtArgs>
    _count?: boolean | GameModeCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["gameMode"]>

  export type GameModeSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["gameMode"]>

  export type GameModeSelectScalar = {
    id?: boolean
    gameId?: boolean
    name?: boolean
    displayName?: boolean
    isActive?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type GameModeInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    matches?: boolean | GameMode$matchesArgs<ExtArgs>
    _count?: boolean | GameModeCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type GameModeIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
  }

  export type $GameModePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "GameMode"
    objects: {
      game: Prisma.$GamePayload<ExtArgs>
      matches: Prisma.$MatchPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string
      name: string
      displayName: string
      isActive: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["gameMode"]>
    composites: {}
  }

  type GameModeGetPayload<S extends boolean | null | undefined | GameModeDefaultArgs> = $Result.GetResult<Prisma.$GameModePayload, S>

  type GameModeCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<GameModeFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: GameModeCountAggregateInputType | true
    }

  export interface GameModeDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['GameMode'], meta: { name: 'GameMode' } }
    /**
     * Find zero or one GameMode that matches the filter.
     * @param {GameModeFindUniqueArgs} args - Arguments to find a GameMode
     * @example
     * // Get one GameMode
     * const gameMode = await prisma.gameMode.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends GameModeFindUniqueArgs>(args: SelectSubset<T, GameModeFindUniqueArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one GameMode that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {GameModeFindUniqueOrThrowArgs} args - Arguments to find a GameMode
     * @example
     * // Get one GameMode
     * const gameMode = await prisma.gameMode.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends GameModeFindUniqueOrThrowArgs>(args: SelectSubset<T, GameModeFindUniqueOrThrowArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first GameMode that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeFindFirstArgs} args - Arguments to find a GameMode
     * @example
     * // Get one GameMode
     * const gameMode = await prisma.gameMode.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends GameModeFindFirstArgs>(args?: SelectSubset<T, GameModeFindFirstArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first GameMode that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeFindFirstOrThrowArgs} args - Arguments to find a GameMode
     * @example
     * // Get one GameMode
     * const gameMode = await prisma.gameMode.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends GameModeFindFirstOrThrowArgs>(args?: SelectSubset<T, GameModeFindFirstOrThrowArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more GameModes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all GameModes
     * const gameModes = await prisma.gameMode.findMany()
     * 
     * // Get first 10 GameModes
     * const gameModes = await prisma.gameMode.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const gameModeWithIdOnly = await prisma.gameMode.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends GameModeFindManyArgs>(args?: SelectSubset<T, GameModeFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findMany">>

    /**
     * Create a GameMode.
     * @param {GameModeCreateArgs} args - Arguments to create a GameMode.
     * @example
     * // Create one GameMode
     * const GameMode = await prisma.gameMode.create({
     *   data: {
     *     // ... data to create a GameMode
     *   }
     * })
     * 
     */
    create<T extends GameModeCreateArgs>(args: SelectSubset<T, GameModeCreateArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many GameModes.
     * @param {GameModeCreateManyArgs} args - Arguments to create many GameModes.
     * @example
     * // Create many GameModes
     * const gameMode = await prisma.gameMode.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends GameModeCreateManyArgs>(args?: SelectSubset<T, GameModeCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many GameModes and returns the data saved in the database.
     * @param {GameModeCreateManyAndReturnArgs} args - Arguments to create many GameModes.
     * @example
     * // Create many GameModes
     * const gameMode = await prisma.gameMode.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many GameModes and only return the `id`
     * const gameModeWithIdOnly = await prisma.gameMode.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends GameModeCreateManyAndReturnArgs>(args?: SelectSubset<T, GameModeCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a GameMode.
     * @param {GameModeDeleteArgs} args - Arguments to delete one GameMode.
     * @example
     * // Delete one GameMode
     * const GameMode = await prisma.gameMode.delete({
     *   where: {
     *     // ... filter to delete one GameMode
     *   }
     * })
     * 
     */
    delete<T extends GameModeDeleteArgs>(args: SelectSubset<T, GameModeDeleteArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one GameMode.
     * @param {GameModeUpdateArgs} args - Arguments to update one GameMode.
     * @example
     * // Update one GameMode
     * const gameMode = await prisma.gameMode.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends GameModeUpdateArgs>(args: SelectSubset<T, GameModeUpdateArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more GameModes.
     * @param {GameModeDeleteManyArgs} args - Arguments to filter GameModes to delete.
     * @example
     * // Delete a few GameModes
     * const { count } = await prisma.gameMode.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends GameModeDeleteManyArgs>(args?: SelectSubset<T, GameModeDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more GameModes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many GameModes
     * const gameMode = await prisma.gameMode.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends GameModeUpdateManyArgs>(args: SelectSubset<T, GameModeUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one GameMode.
     * @param {GameModeUpsertArgs} args - Arguments to update or create a GameMode.
     * @example
     * // Update or create a GameMode
     * const gameMode = await prisma.gameMode.upsert({
     *   create: {
     *     // ... data to create a GameMode
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the GameMode we want to update
     *   }
     * })
     */
    upsert<T extends GameModeUpsertArgs>(args: SelectSubset<T, GameModeUpsertArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of GameModes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeCountArgs} args - Arguments to filter GameModes to count.
     * @example
     * // Count the number of GameModes
     * const count = await prisma.gameMode.count({
     *   where: {
     *     // ... the filter for the GameModes we want to count
     *   }
     * })
    **/
    count<T extends GameModeCountArgs>(
      args?: Subset<T, GameModeCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], GameModeCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a GameMode.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends GameModeAggregateArgs>(args: Subset<T, GameModeAggregateArgs>): Prisma.PrismaPromise<GetGameModeAggregateType<T>>

    /**
     * Group by GameMode.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameModeGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends GameModeGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: GameModeGroupByArgs['orderBy'] }
        : { orderBy?: GameModeGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, GameModeGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetGameModeGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the GameMode model
   */
  readonly fields: GameModeFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for GameMode.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__GameModeClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends GameDefaultArgs<ExtArgs> = {}>(args?: Subset<T, GameDefaultArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    matches<T extends GameMode$matchesArgs<ExtArgs> = {}>(args?: Subset<T, GameMode$matchesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the GameMode model
   */ 
  interface GameModeFieldRefs {
    readonly id: FieldRef<"GameMode", 'String'>
    readonly gameId: FieldRef<"GameMode", 'String'>
    readonly name: FieldRef<"GameMode", 'String'>
    readonly displayName: FieldRef<"GameMode", 'String'>
    readonly isActive: FieldRef<"GameMode", 'Boolean'>
    readonly createdAt: FieldRef<"GameMode", 'DateTime'>
    readonly updatedAt: FieldRef<"GameMode", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * GameMode findUnique
   */
  export type GameModeFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * Filter, which GameMode to fetch.
     */
    where: GameModeWhereUniqueInput
  }

  /**
   * GameMode findUniqueOrThrow
   */
  export type GameModeFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * Filter, which GameMode to fetch.
     */
    where: GameModeWhereUniqueInput
  }

  /**
   * GameMode findFirst
   */
  export type GameModeFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * Filter, which GameMode to fetch.
     */
    where?: GameModeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameModes to fetch.
     */
    orderBy?: GameModeOrderByWithRelationInput | GameModeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for GameModes.
     */
    cursor?: GameModeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameModes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameModes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of GameModes.
     */
    distinct?: GameModeScalarFieldEnum | GameModeScalarFieldEnum[]
  }

  /**
   * GameMode findFirstOrThrow
   */
  export type GameModeFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * Filter, which GameMode to fetch.
     */
    where?: GameModeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameModes to fetch.
     */
    orderBy?: GameModeOrderByWithRelationInput | GameModeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for GameModes.
     */
    cursor?: GameModeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameModes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameModes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of GameModes.
     */
    distinct?: GameModeScalarFieldEnum | GameModeScalarFieldEnum[]
  }

  /**
   * GameMode findMany
   */
  export type GameModeFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * Filter, which GameModes to fetch.
     */
    where?: GameModeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameModes to fetch.
     */
    orderBy?: GameModeOrderByWithRelationInput | GameModeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing GameModes.
     */
    cursor?: GameModeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameModes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameModes.
     */
    skip?: number
    distinct?: GameModeScalarFieldEnum | GameModeScalarFieldEnum[]
  }

  /**
   * GameMode create
   */
  export type GameModeCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * The data needed to create a GameMode.
     */
    data: XOR<GameModeCreateInput, GameModeUncheckedCreateInput>
  }

  /**
   * GameMode createMany
   */
  export type GameModeCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many GameModes.
     */
    data: GameModeCreateManyInput | GameModeCreateManyInput[]
  }

  /**
   * GameMode createManyAndReturn
   */
  export type GameModeCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many GameModes.
     */
    data: GameModeCreateManyInput | GameModeCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * GameMode update
   */
  export type GameModeUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * The data needed to update a GameMode.
     */
    data: XOR<GameModeUpdateInput, GameModeUncheckedUpdateInput>
    /**
     * Choose, which GameMode to update.
     */
    where: GameModeWhereUniqueInput
  }

  /**
   * GameMode updateMany
   */
  export type GameModeUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update GameModes.
     */
    data: XOR<GameModeUpdateManyMutationInput, GameModeUncheckedUpdateManyInput>
    /**
     * Filter which GameModes to update
     */
    where?: GameModeWhereInput
  }

  /**
   * GameMode upsert
   */
  export type GameModeUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * The filter to search for the GameMode to update in case it exists.
     */
    where: GameModeWhereUniqueInput
    /**
     * In case the GameMode found by the `where` argument doesn't exist, create a new GameMode with this data.
     */
    create: XOR<GameModeCreateInput, GameModeUncheckedCreateInput>
    /**
     * In case the GameMode was found with the provided `where` argument, update it with this data.
     */
    update: XOR<GameModeUpdateInput, GameModeUncheckedUpdateInput>
  }

  /**
   * GameMode delete
   */
  export type GameModeDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    /**
     * Filter which GameMode to delete.
     */
    where: GameModeWhereUniqueInput
  }

  /**
   * GameMode deleteMany
   */
  export type GameModeDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which GameModes to delete
     */
    where?: GameModeWhereInput
  }

  /**
   * GameMode.matches
   */
  export type GameMode$matchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    where?: MatchWhereInput
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    cursor?: MatchWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchScalarFieldEnum | MatchScalarFieldEnum[]
  }

  /**
   * GameMode without action
   */
  export type GameModeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
  }


  /**
   * Model Match
   */

  export type AggregateMatch = {
    _count: MatchCountAggregateOutputType | null
    _min: MatchMinAggregateOutputType | null
    _max: MatchMaxAggregateOutputType | null
  }

  export type MatchMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    mapId: string | null
    gameModeId: string | null
    matchCode: string | null
    startTime: Date | null
    endTime: Date | null
    status: string | null
    metadata: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MatchMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    mapId: string | null
    gameModeId: string | null
    matchCode: string | null
    startTime: Date | null
    endTime: Date | null
    status: string | null
    metadata: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MatchCountAggregateOutputType = {
    id: number
    gameId: number
    mapId: number
    gameModeId: number
    matchCode: number
    startTime: number
    endTime: number
    status: number
    metadata: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type MatchMinAggregateInputType = {
    id?: true
    gameId?: true
    mapId?: true
    gameModeId?: true
    matchCode?: true
    startTime?: true
    endTime?: true
    status?: true
    metadata?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MatchMaxAggregateInputType = {
    id?: true
    gameId?: true
    mapId?: true
    gameModeId?: true
    matchCode?: true
    startTime?: true
    endTime?: true
    status?: true
    metadata?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MatchCountAggregateInputType = {
    id?: true
    gameId?: true
    mapId?: true
    gameModeId?: true
    matchCode?: true
    startTime?: true
    endTime?: true
    status?: true
    metadata?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type MatchAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Match to aggregate.
     */
    where?: MatchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Matches to fetch.
     */
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: MatchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Matches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Matches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Matches
    **/
    _count?: true | MatchCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: MatchMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: MatchMaxAggregateInputType
  }

  export type GetMatchAggregateType<T extends MatchAggregateArgs> = {
        [P in keyof T & keyof AggregateMatch]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateMatch[P]>
      : GetScalarType<T[P], AggregateMatch[P]>
  }




  export type MatchGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchWhereInput
    orderBy?: MatchOrderByWithAggregationInput | MatchOrderByWithAggregationInput[]
    by: MatchScalarFieldEnum[] | MatchScalarFieldEnum
    having?: MatchScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: MatchCountAggregateInputType | true
    _min?: MatchMinAggregateInputType
    _max?: MatchMaxAggregateInputType
  }

  export type MatchGroupByOutputType = {
    id: string
    gameId: string
    mapId: string | null
    gameModeId: string | null
    matchCode: string | null
    startTime: Date
    endTime: Date | null
    status: string
    metadata: string | null
    createdAt: Date
    updatedAt: Date
    _count: MatchCountAggregateOutputType | null
    _min: MatchMinAggregateOutputType | null
    _max: MatchMaxAggregateOutputType | null
  }

  type GetMatchGroupByPayload<T extends MatchGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<MatchGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof MatchGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], MatchGroupByOutputType[P]>
            : GetScalarType<T[P], MatchGroupByOutputType[P]>
        }
      >
    >


  export type MatchSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    mapId?: boolean
    gameModeId?: boolean
    matchCode?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    map?: boolean | Match$mapArgs<ExtArgs>
    gameMode?: boolean | Match$gameModeArgs<ExtArgs>
    matchResults?: boolean | Match$matchResultsArgs<ExtArgs>
    playerStats?: boolean | Match$playerStatsArgs<ExtArgs>
    _count?: boolean | MatchCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["match"]>

  export type MatchSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    mapId?: boolean
    gameModeId?: boolean
    matchCode?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    map?: boolean | Match$mapArgs<ExtArgs>
    gameMode?: boolean | Match$gameModeArgs<ExtArgs>
  }, ExtArgs["result"]["match"]>

  export type MatchSelectScalar = {
    id?: boolean
    gameId?: boolean
    mapId?: boolean
    gameModeId?: boolean
    matchCode?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    metadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type MatchInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    map?: boolean | Match$mapArgs<ExtArgs>
    gameMode?: boolean | Match$gameModeArgs<ExtArgs>
    matchResults?: boolean | Match$matchResultsArgs<ExtArgs>
    playerStats?: boolean | Match$playerStatsArgs<ExtArgs>
    _count?: boolean | MatchCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type MatchIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    map?: boolean | Match$mapArgs<ExtArgs>
    gameMode?: boolean | Match$gameModeArgs<ExtArgs>
  }

  export type $MatchPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Match"
    objects: {
      game: Prisma.$GamePayload<ExtArgs>
      map: Prisma.$MapPayload<ExtArgs> | null
      gameMode: Prisma.$GameModePayload<ExtArgs> | null
      matchResults: Prisma.$MatchResultPayload<ExtArgs>[]
      playerStats: Prisma.$PlayerStatsPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string
      mapId: string | null
      gameModeId: string | null
      matchCode: string | null
      startTime: Date
      endTime: Date | null
      status: string
      metadata: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["match"]>
    composites: {}
  }

  type MatchGetPayload<S extends boolean | null | undefined | MatchDefaultArgs> = $Result.GetResult<Prisma.$MatchPayload, S>

  type MatchCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<MatchFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: MatchCountAggregateInputType | true
    }

  export interface MatchDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Match'], meta: { name: 'Match' } }
    /**
     * Find zero or one Match that matches the filter.
     * @param {MatchFindUniqueArgs} args - Arguments to find a Match
     * @example
     * // Get one Match
     * const match = await prisma.match.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends MatchFindUniqueArgs>(args: SelectSubset<T, MatchFindUniqueArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Match that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {MatchFindUniqueOrThrowArgs} args - Arguments to find a Match
     * @example
     * // Get one Match
     * const match = await prisma.match.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends MatchFindUniqueOrThrowArgs>(args: SelectSubset<T, MatchFindUniqueOrThrowArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Match that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchFindFirstArgs} args - Arguments to find a Match
     * @example
     * // Get one Match
     * const match = await prisma.match.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends MatchFindFirstArgs>(args?: SelectSubset<T, MatchFindFirstArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Match that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchFindFirstOrThrowArgs} args - Arguments to find a Match
     * @example
     * // Get one Match
     * const match = await prisma.match.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends MatchFindFirstOrThrowArgs>(args?: SelectSubset<T, MatchFindFirstOrThrowArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Matches that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Matches
     * const matches = await prisma.match.findMany()
     * 
     * // Get first 10 Matches
     * const matches = await prisma.match.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const matchWithIdOnly = await prisma.match.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends MatchFindManyArgs>(args?: SelectSubset<T, MatchFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Match.
     * @param {MatchCreateArgs} args - Arguments to create a Match.
     * @example
     * // Create one Match
     * const Match = await prisma.match.create({
     *   data: {
     *     // ... data to create a Match
     *   }
     * })
     * 
     */
    create<T extends MatchCreateArgs>(args: SelectSubset<T, MatchCreateArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Matches.
     * @param {MatchCreateManyArgs} args - Arguments to create many Matches.
     * @example
     * // Create many Matches
     * const match = await prisma.match.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends MatchCreateManyArgs>(args?: SelectSubset<T, MatchCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Matches and returns the data saved in the database.
     * @param {MatchCreateManyAndReturnArgs} args - Arguments to create many Matches.
     * @example
     * // Create many Matches
     * const match = await prisma.match.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Matches and only return the `id`
     * const matchWithIdOnly = await prisma.match.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends MatchCreateManyAndReturnArgs>(args?: SelectSubset<T, MatchCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Match.
     * @param {MatchDeleteArgs} args - Arguments to delete one Match.
     * @example
     * // Delete one Match
     * const Match = await prisma.match.delete({
     *   where: {
     *     // ... filter to delete one Match
     *   }
     * })
     * 
     */
    delete<T extends MatchDeleteArgs>(args: SelectSubset<T, MatchDeleteArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Match.
     * @param {MatchUpdateArgs} args - Arguments to update one Match.
     * @example
     * // Update one Match
     * const match = await prisma.match.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends MatchUpdateArgs>(args: SelectSubset<T, MatchUpdateArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Matches.
     * @param {MatchDeleteManyArgs} args - Arguments to filter Matches to delete.
     * @example
     * // Delete a few Matches
     * const { count } = await prisma.match.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends MatchDeleteManyArgs>(args?: SelectSubset<T, MatchDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Matches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Matches
     * const match = await prisma.match.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends MatchUpdateManyArgs>(args: SelectSubset<T, MatchUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Match.
     * @param {MatchUpsertArgs} args - Arguments to update or create a Match.
     * @example
     * // Update or create a Match
     * const match = await prisma.match.upsert({
     *   create: {
     *     // ... data to create a Match
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Match we want to update
     *   }
     * })
     */
    upsert<T extends MatchUpsertArgs>(args: SelectSubset<T, MatchUpsertArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Matches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchCountArgs} args - Arguments to filter Matches to count.
     * @example
     * // Count the number of Matches
     * const count = await prisma.match.count({
     *   where: {
     *     // ... the filter for the Matches we want to count
     *   }
     * })
    **/
    count<T extends MatchCountArgs>(
      args?: Subset<T, MatchCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], MatchCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Match.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends MatchAggregateArgs>(args: Subset<T, MatchAggregateArgs>): Prisma.PrismaPromise<GetMatchAggregateType<T>>

    /**
     * Group by Match.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends MatchGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: MatchGroupByArgs['orderBy'] }
        : { orderBy?: MatchGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, MatchGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetMatchGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Match model
   */
  readonly fields: MatchFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Match.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__MatchClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends GameDefaultArgs<ExtArgs> = {}>(args?: Subset<T, GameDefaultArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    map<T extends Match$mapArgs<ExtArgs> = {}>(args?: Subset<T, Match$mapArgs<ExtArgs>>): Prisma__MapClient<$Result.GetResult<Prisma.$MapPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    gameMode<T extends Match$gameModeArgs<ExtArgs> = {}>(args?: Subset<T, Match$gameModeArgs<ExtArgs>>): Prisma__GameModeClient<$Result.GetResult<Prisma.$GameModePayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    matchResults<T extends Match$matchResultsArgs<ExtArgs> = {}>(args?: Subset<T, Match$matchResultsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findMany"> | Null>
    playerStats<T extends Match$playerStatsArgs<ExtArgs> = {}>(args?: Subset<T, Match$playerStatsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Match model
   */ 
  interface MatchFieldRefs {
    readonly id: FieldRef<"Match", 'String'>
    readonly gameId: FieldRef<"Match", 'String'>
    readonly mapId: FieldRef<"Match", 'String'>
    readonly gameModeId: FieldRef<"Match", 'String'>
    readonly matchCode: FieldRef<"Match", 'String'>
    readonly startTime: FieldRef<"Match", 'DateTime'>
    readonly endTime: FieldRef<"Match", 'DateTime'>
    readonly status: FieldRef<"Match", 'String'>
    readonly metadata: FieldRef<"Match", 'String'>
    readonly createdAt: FieldRef<"Match", 'DateTime'>
    readonly updatedAt: FieldRef<"Match", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Match findUnique
   */
  export type MatchFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * Filter, which Match to fetch.
     */
    where: MatchWhereUniqueInput
  }

  /**
   * Match findUniqueOrThrow
   */
  export type MatchFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * Filter, which Match to fetch.
     */
    where: MatchWhereUniqueInput
  }

  /**
   * Match findFirst
   */
  export type MatchFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * Filter, which Match to fetch.
     */
    where?: MatchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Matches to fetch.
     */
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Matches.
     */
    cursor?: MatchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Matches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Matches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Matches.
     */
    distinct?: MatchScalarFieldEnum | MatchScalarFieldEnum[]
  }

  /**
   * Match findFirstOrThrow
   */
  export type MatchFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * Filter, which Match to fetch.
     */
    where?: MatchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Matches to fetch.
     */
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Matches.
     */
    cursor?: MatchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Matches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Matches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Matches.
     */
    distinct?: MatchScalarFieldEnum | MatchScalarFieldEnum[]
  }

  /**
   * Match findMany
   */
  export type MatchFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * Filter, which Matches to fetch.
     */
    where?: MatchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Matches to fetch.
     */
    orderBy?: MatchOrderByWithRelationInput | MatchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Matches.
     */
    cursor?: MatchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Matches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Matches.
     */
    skip?: number
    distinct?: MatchScalarFieldEnum | MatchScalarFieldEnum[]
  }

  /**
   * Match create
   */
  export type MatchCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * The data needed to create a Match.
     */
    data: XOR<MatchCreateInput, MatchUncheckedCreateInput>
  }

  /**
   * Match createMany
   */
  export type MatchCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Matches.
     */
    data: MatchCreateManyInput | MatchCreateManyInput[]
  }

  /**
   * Match createManyAndReturn
   */
  export type MatchCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Matches.
     */
    data: MatchCreateManyInput | MatchCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Match update
   */
  export type MatchUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * The data needed to update a Match.
     */
    data: XOR<MatchUpdateInput, MatchUncheckedUpdateInput>
    /**
     * Choose, which Match to update.
     */
    where: MatchWhereUniqueInput
  }

  /**
   * Match updateMany
   */
  export type MatchUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Matches.
     */
    data: XOR<MatchUpdateManyMutationInput, MatchUncheckedUpdateManyInput>
    /**
     * Filter which Matches to update
     */
    where?: MatchWhereInput
  }

  /**
   * Match upsert
   */
  export type MatchUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * The filter to search for the Match to update in case it exists.
     */
    where: MatchWhereUniqueInput
    /**
     * In case the Match found by the `where` argument doesn't exist, create a new Match with this data.
     */
    create: XOR<MatchCreateInput, MatchUncheckedCreateInput>
    /**
     * In case the Match was found with the provided `where` argument, update it with this data.
     */
    update: XOR<MatchUpdateInput, MatchUncheckedUpdateInput>
  }

  /**
   * Match delete
   */
  export type MatchDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    /**
     * Filter which Match to delete.
     */
    where: MatchWhereUniqueInput
  }

  /**
   * Match deleteMany
   */
  export type MatchDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Matches to delete
     */
    where?: MatchWhereInput
  }

  /**
   * Match.map
   */
  export type Match$mapArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Map
     */
    select?: MapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MapInclude<ExtArgs> | null
    where?: MapWhereInput
  }

  /**
   * Match.gameMode
   */
  export type Match$gameModeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameMode
     */
    select?: GameModeSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameModeInclude<ExtArgs> | null
    where?: GameModeWhereInput
  }

  /**
   * Match.matchResults
   */
  export type Match$matchResultsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    where?: MatchResultWhereInput
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    cursor?: MatchResultWhereUniqueInput
    take?: number
    skip?: number
    distinct?: MatchResultScalarFieldEnum | MatchResultScalarFieldEnum[]
  }

  /**
   * Match.playerStats
   */
  export type Match$playerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    where?: PlayerStatsWhereInput
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    cursor?: PlayerStatsWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PlayerStatsScalarFieldEnum | PlayerStatsScalarFieldEnum[]
  }

  /**
   * Match without action
   */
  export type MatchDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
  }


  /**
   * Model MatchResult
   */

  export type AggregateMatchResult = {
    _count: MatchResultCountAggregateOutputType | null
    _avg: MatchResultAvgAggregateOutputType | null
    _sum: MatchResultSumAggregateOutputType | null
    _min: MatchResultMinAggregateOutputType | null
    _max: MatchResultMaxAggregateOutputType | null
  }

  export type MatchResultAvgAggregateOutputType = {
    score: number | null
    placement: number | null
  }

  export type MatchResultSumAggregateOutputType = {
    score: number | null
    placement: number | null
  }

  export type MatchResultMinAggregateOutputType = {
    id: string | null
    matchId: string | null
    playerId: string | null
    characterId: string | null
    team: string | null
    result: string | null
    score: number | null
    placement: number | null
    statsJson: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MatchResultMaxAggregateOutputType = {
    id: string | null
    matchId: string | null
    playerId: string | null
    characterId: string | null
    team: string | null
    result: string | null
    score: number | null
    placement: number | null
    statsJson: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type MatchResultCountAggregateOutputType = {
    id: number
    matchId: number
    playerId: number
    characterId: number
    team: number
    result: number
    score: number
    placement: number
    statsJson: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type MatchResultAvgAggregateInputType = {
    score?: true
    placement?: true
  }

  export type MatchResultSumAggregateInputType = {
    score?: true
    placement?: true
  }

  export type MatchResultMinAggregateInputType = {
    id?: true
    matchId?: true
    playerId?: true
    characterId?: true
    team?: true
    result?: true
    score?: true
    placement?: true
    statsJson?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MatchResultMaxAggregateInputType = {
    id?: true
    matchId?: true
    playerId?: true
    characterId?: true
    team?: true
    result?: true
    score?: true
    placement?: true
    statsJson?: true
    createdAt?: true
    updatedAt?: true
  }

  export type MatchResultCountAggregateInputType = {
    id?: true
    matchId?: true
    playerId?: true
    characterId?: true
    team?: true
    result?: true
    score?: true
    placement?: true
    statsJson?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type MatchResultAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MatchResult to aggregate.
     */
    where?: MatchResultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchResults to fetch.
     */
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: MatchResultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchResults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchResults.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned MatchResults
    **/
    _count?: true | MatchResultCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: MatchResultAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: MatchResultSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: MatchResultMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: MatchResultMaxAggregateInputType
  }

  export type GetMatchResultAggregateType<T extends MatchResultAggregateArgs> = {
        [P in keyof T & keyof AggregateMatchResult]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateMatchResult[P]>
      : GetScalarType<T[P], AggregateMatchResult[P]>
  }




  export type MatchResultGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MatchResultWhereInput
    orderBy?: MatchResultOrderByWithAggregationInput | MatchResultOrderByWithAggregationInput[]
    by: MatchResultScalarFieldEnum[] | MatchResultScalarFieldEnum
    having?: MatchResultScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: MatchResultCountAggregateInputType | true
    _avg?: MatchResultAvgAggregateInputType
    _sum?: MatchResultSumAggregateInputType
    _min?: MatchResultMinAggregateInputType
    _max?: MatchResultMaxAggregateInputType
  }

  export type MatchResultGroupByOutputType = {
    id: string
    matchId: string
    playerId: string
    characterId: string | null
    team: string | null
    result: string | null
    score: number | null
    placement: number | null
    statsJson: string | null
    createdAt: Date
    updatedAt: Date
    _count: MatchResultCountAggregateOutputType | null
    _avg: MatchResultAvgAggregateOutputType | null
    _sum: MatchResultSumAggregateOutputType | null
    _min: MatchResultMinAggregateOutputType | null
    _max: MatchResultMaxAggregateOutputType | null
  }

  type GetMatchResultGroupByPayload<T extends MatchResultGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<MatchResultGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof MatchResultGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], MatchResultGroupByOutputType[P]>
            : GetScalarType<T[P], MatchResultGroupByOutputType[P]>
        }
      >
    >


  export type MatchResultSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    matchId?: boolean
    playerId?: boolean
    characterId?: boolean
    team?: boolean
    result?: boolean
    score?: boolean
    placement?: boolean
    statsJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    match?: boolean | MatchDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    character?: boolean | MatchResult$characterArgs<ExtArgs>
  }, ExtArgs["result"]["matchResult"]>

  export type MatchResultSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    matchId?: boolean
    playerId?: boolean
    characterId?: boolean
    team?: boolean
    result?: boolean
    score?: boolean
    placement?: boolean
    statsJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    match?: boolean | MatchDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    character?: boolean | MatchResult$characterArgs<ExtArgs>
  }, ExtArgs["result"]["matchResult"]>

  export type MatchResultSelectScalar = {
    id?: boolean
    matchId?: boolean
    playerId?: boolean
    characterId?: boolean
    team?: boolean
    result?: boolean
    score?: boolean
    placement?: boolean
    statsJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type MatchResultInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    match?: boolean | MatchDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    character?: boolean | MatchResult$characterArgs<ExtArgs>
  }
  export type MatchResultIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    match?: boolean | MatchDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    character?: boolean | MatchResult$characterArgs<ExtArgs>
  }

  export type $MatchResultPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "MatchResult"
    objects: {
      match: Prisma.$MatchPayload<ExtArgs>
      player: Prisma.$PlayerPayload<ExtArgs>
      character: Prisma.$CharacterPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      matchId: string
      playerId: string
      characterId: string | null
      team: string | null
      result: string | null
      score: number | null
      placement: number | null
      statsJson: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["matchResult"]>
    composites: {}
  }

  type MatchResultGetPayload<S extends boolean | null | undefined | MatchResultDefaultArgs> = $Result.GetResult<Prisma.$MatchResultPayload, S>

  type MatchResultCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<MatchResultFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: MatchResultCountAggregateInputType | true
    }

  export interface MatchResultDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['MatchResult'], meta: { name: 'MatchResult' } }
    /**
     * Find zero or one MatchResult that matches the filter.
     * @param {MatchResultFindUniqueArgs} args - Arguments to find a MatchResult
     * @example
     * // Get one MatchResult
     * const matchResult = await prisma.matchResult.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends MatchResultFindUniqueArgs>(args: SelectSubset<T, MatchResultFindUniqueArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one MatchResult that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {MatchResultFindUniqueOrThrowArgs} args - Arguments to find a MatchResult
     * @example
     * // Get one MatchResult
     * const matchResult = await prisma.matchResult.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends MatchResultFindUniqueOrThrowArgs>(args: SelectSubset<T, MatchResultFindUniqueOrThrowArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first MatchResult that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultFindFirstArgs} args - Arguments to find a MatchResult
     * @example
     * // Get one MatchResult
     * const matchResult = await prisma.matchResult.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends MatchResultFindFirstArgs>(args?: SelectSubset<T, MatchResultFindFirstArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first MatchResult that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultFindFirstOrThrowArgs} args - Arguments to find a MatchResult
     * @example
     * // Get one MatchResult
     * const matchResult = await prisma.matchResult.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends MatchResultFindFirstOrThrowArgs>(args?: SelectSubset<T, MatchResultFindFirstOrThrowArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more MatchResults that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all MatchResults
     * const matchResults = await prisma.matchResult.findMany()
     * 
     * // Get first 10 MatchResults
     * const matchResults = await prisma.matchResult.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const matchResultWithIdOnly = await prisma.matchResult.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends MatchResultFindManyArgs>(args?: SelectSubset<T, MatchResultFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a MatchResult.
     * @param {MatchResultCreateArgs} args - Arguments to create a MatchResult.
     * @example
     * // Create one MatchResult
     * const MatchResult = await prisma.matchResult.create({
     *   data: {
     *     // ... data to create a MatchResult
     *   }
     * })
     * 
     */
    create<T extends MatchResultCreateArgs>(args: SelectSubset<T, MatchResultCreateArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many MatchResults.
     * @param {MatchResultCreateManyArgs} args - Arguments to create many MatchResults.
     * @example
     * // Create many MatchResults
     * const matchResult = await prisma.matchResult.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends MatchResultCreateManyArgs>(args?: SelectSubset<T, MatchResultCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many MatchResults and returns the data saved in the database.
     * @param {MatchResultCreateManyAndReturnArgs} args - Arguments to create many MatchResults.
     * @example
     * // Create many MatchResults
     * const matchResult = await prisma.matchResult.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many MatchResults and only return the `id`
     * const matchResultWithIdOnly = await prisma.matchResult.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends MatchResultCreateManyAndReturnArgs>(args?: SelectSubset<T, MatchResultCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a MatchResult.
     * @param {MatchResultDeleteArgs} args - Arguments to delete one MatchResult.
     * @example
     * // Delete one MatchResult
     * const MatchResult = await prisma.matchResult.delete({
     *   where: {
     *     // ... filter to delete one MatchResult
     *   }
     * })
     * 
     */
    delete<T extends MatchResultDeleteArgs>(args: SelectSubset<T, MatchResultDeleteArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one MatchResult.
     * @param {MatchResultUpdateArgs} args - Arguments to update one MatchResult.
     * @example
     * // Update one MatchResult
     * const matchResult = await prisma.matchResult.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends MatchResultUpdateArgs>(args: SelectSubset<T, MatchResultUpdateArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more MatchResults.
     * @param {MatchResultDeleteManyArgs} args - Arguments to filter MatchResults to delete.
     * @example
     * // Delete a few MatchResults
     * const { count } = await prisma.matchResult.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends MatchResultDeleteManyArgs>(args?: SelectSubset<T, MatchResultDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more MatchResults.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many MatchResults
     * const matchResult = await prisma.matchResult.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends MatchResultUpdateManyArgs>(args: SelectSubset<T, MatchResultUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one MatchResult.
     * @param {MatchResultUpsertArgs} args - Arguments to update or create a MatchResult.
     * @example
     * // Update or create a MatchResult
     * const matchResult = await prisma.matchResult.upsert({
     *   create: {
     *     // ... data to create a MatchResult
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the MatchResult we want to update
     *   }
     * })
     */
    upsert<T extends MatchResultUpsertArgs>(args: SelectSubset<T, MatchResultUpsertArgs<ExtArgs>>): Prisma__MatchResultClient<$Result.GetResult<Prisma.$MatchResultPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of MatchResults.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultCountArgs} args - Arguments to filter MatchResults to count.
     * @example
     * // Count the number of MatchResults
     * const count = await prisma.matchResult.count({
     *   where: {
     *     // ... the filter for the MatchResults we want to count
     *   }
     * })
    **/
    count<T extends MatchResultCountArgs>(
      args?: Subset<T, MatchResultCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], MatchResultCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a MatchResult.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends MatchResultAggregateArgs>(args: Subset<T, MatchResultAggregateArgs>): Prisma.PrismaPromise<GetMatchResultAggregateType<T>>

    /**
     * Group by MatchResult.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MatchResultGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends MatchResultGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: MatchResultGroupByArgs['orderBy'] }
        : { orderBy?: MatchResultGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, MatchResultGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetMatchResultGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the MatchResult model
   */
  readonly fields: MatchResultFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for MatchResult.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__MatchResultClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    match<T extends MatchDefaultArgs<ExtArgs> = {}>(args?: Subset<T, MatchDefaultArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    player<T extends PlayerDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PlayerDefaultArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    character<T extends MatchResult$characterArgs<ExtArgs> = {}>(args?: Subset<T, MatchResult$characterArgs<ExtArgs>>): Prisma__CharacterClient<$Result.GetResult<Prisma.$CharacterPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the MatchResult model
   */ 
  interface MatchResultFieldRefs {
    readonly id: FieldRef<"MatchResult", 'String'>
    readonly matchId: FieldRef<"MatchResult", 'String'>
    readonly playerId: FieldRef<"MatchResult", 'String'>
    readonly characterId: FieldRef<"MatchResult", 'String'>
    readonly team: FieldRef<"MatchResult", 'String'>
    readonly result: FieldRef<"MatchResult", 'String'>
    readonly score: FieldRef<"MatchResult", 'Int'>
    readonly placement: FieldRef<"MatchResult", 'Int'>
    readonly statsJson: FieldRef<"MatchResult", 'String'>
    readonly createdAt: FieldRef<"MatchResult", 'DateTime'>
    readonly updatedAt: FieldRef<"MatchResult", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * MatchResult findUnique
   */
  export type MatchResultFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * Filter, which MatchResult to fetch.
     */
    where: MatchResultWhereUniqueInput
  }

  /**
   * MatchResult findUniqueOrThrow
   */
  export type MatchResultFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * Filter, which MatchResult to fetch.
     */
    where: MatchResultWhereUniqueInput
  }

  /**
   * MatchResult findFirst
   */
  export type MatchResultFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * Filter, which MatchResult to fetch.
     */
    where?: MatchResultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchResults to fetch.
     */
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MatchResults.
     */
    cursor?: MatchResultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchResults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchResults.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MatchResults.
     */
    distinct?: MatchResultScalarFieldEnum | MatchResultScalarFieldEnum[]
  }

  /**
   * MatchResult findFirstOrThrow
   */
  export type MatchResultFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * Filter, which MatchResult to fetch.
     */
    where?: MatchResultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchResults to fetch.
     */
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MatchResults.
     */
    cursor?: MatchResultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchResults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchResults.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MatchResults.
     */
    distinct?: MatchResultScalarFieldEnum | MatchResultScalarFieldEnum[]
  }

  /**
   * MatchResult findMany
   */
  export type MatchResultFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * Filter, which MatchResults to fetch.
     */
    where?: MatchResultWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MatchResults to fetch.
     */
    orderBy?: MatchResultOrderByWithRelationInput | MatchResultOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing MatchResults.
     */
    cursor?: MatchResultWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MatchResults from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MatchResults.
     */
    skip?: number
    distinct?: MatchResultScalarFieldEnum | MatchResultScalarFieldEnum[]
  }

  /**
   * MatchResult create
   */
  export type MatchResultCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * The data needed to create a MatchResult.
     */
    data: XOR<MatchResultCreateInput, MatchResultUncheckedCreateInput>
  }

  /**
   * MatchResult createMany
   */
  export type MatchResultCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many MatchResults.
     */
    data: MatchResultCreateManyInput | MatchResultCreateManyInput[]
  }

  /**
   * MatchResult createManyAndReturn
   */
  export type MatchResultCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many MatchResults.
     */
    data: MatchResultCreateManyInput | MatchResultCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * MatchResult update
   */
  export type MatchResultUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * The data needed to update a MatchResult.
     */
    data: XOR<MatchResultUpdateInput, MatchResultUncheckedUpdateInput>
    /**
     * Choose, which MatchResult to update.
     */
    where: MatchResultWhereUniqueInput
  }

  /**
   * MatchResult updateMany
   */
  export type MatchResultUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update MatchResults.
     */
    data: XOR<MatchResultUpdateManyMutationInput, MatchResultUncheckedUpdateManyInput>
    /**
     * Filter which MatchResults to update
     */
    where?: MatchResultWhereInput
  }

  /**
   * MatchResult upsert
   */
  export type MatchResultUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * The filter to search for the MatchResult to update in case it exists.
     */
    where: MatchResultWhereUniqueInput
    /**
     * In case the MatchResult found by the `where` argument doesn't exist, create a new MatchResult with this data.
     */
    create: XOR<MatchResultCreateInput, MatchResultUncheckedCreateInput>
    /**
     * In case the MatchResult was found with the provided `where` argument, update it with this data.
     */
    update: XOR<MatchResultUpdateInput, MatchResultUncheckedUpdateInput>
  }

  /**
   * MatchResult delete
   */
  export type MatchResultDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
    /**
     * Filter which MatchResult to delete.
     */
    where: MatchResultWhereUniqueInput
  }

  /**
   * MatchResult deleteMany
   */
  export type MatchResultDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MatchResults to delete
     */
    where?: MatchResultWhereInput
  }

  /**
   * MatchResult.character
   */
  export type MatchResult$characterArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Character
     */
    select?: CharacterSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CharacterInclude<ExtArgs> | null
    where?: CharacterWhereInput
  }

  /**
   * MatchResult without action
   */
  export type MatchResultDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MatchResult
     */
    select?: MatchResultSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchResultInclude<ExtArgs> | null
  }


  /**
   * Model PlayerStats
   */

  export type AggregatePlayerStats = {
    _count: PlayerStatsCountAggregateOutputType | null
    _min: PlayerStatsMinAggregateOutputType | null
    _max: PlayerStatsMaxAggregateOutputType | null
  }

  export type PlayerStatsMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    playerId: string | null
    matchId: string | null
    statType: string | null
    period: string | null
    statisticsJson: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PlayerStatsMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    playerId: string | null
    matchId: string | null
    statType: string | null
    period: string | null
    statisticsJson: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PlayerStatsCountAggregateOutputType = {
    id: number
    gameId: number
    playerId: number
    matchId: number
    statType: number
    period: number
    statisticsJson: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PlayerStatsMinAggregateInputType = {
    id?: true
    gameId?: true
    playerId?: true
    matchId?: true
    statType?: true
    period?: true
    statisticsJson?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PlayerStatsMaxAggregateInputType = {
    id?: true
    gameId?: true
    playerId?: true
    matchId?: true
    statType?: true
    period?: true
    statisticsJson?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PlayerStatsCountAggregateInputType = {
    id?: true
    gameId?: true
    playerId?: true
    matchId?: true
    statType?: true
    period?: true
    statisticsJson?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PlayerStatsAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PlayerStats to aggregate.
     */
    where?: PlayerStatsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlayerStats to fetch.
     */
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PlayerStatsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlayerStats from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlayerStats.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned PlayerStats
    **/
    _count?: true | PlayerStatsCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PlayerStatsMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PlayerStatsMaxAggregateInputType
  }

  export type GetPlayerStatsAggregateType<T extends PlayerStatsAggregateArgs> = {
        [P in keyof T & keyof AggregatePlayerStats]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePlayerStats[P]>
      : GetScalarType<T[P], AggregatePlayerStats[P]>
  }




  export type PlayerStatsGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PlayerStatsWhereInput
    orderBy?: PlayerStatsOrderByWithAggregationInput | PlayerStatsOrderByWithAggregationInput[]
    by: PlayerStatsScalarFieldEnum[] | PlayerStatsScalarFieldEnum
    having?: PlayerStatsScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PlayerStatsCountAggregateInputType | true
    _min?: PlayerStatsMinAggregateInputType
    _max?: PlayerStatsMaxAggregateInputType
  }

  export type PlayerStatsGroupByOutputType = {
    id: string
    gameId: string
    playerId: string
    matchId: string | null
    statType: string
    period: string | null
    statisticsJson: string
    createdAt: Date
    updatedAt: Date
    _count: PlayerStatsCountAggregateOutputType | null
    _min: PlayerStatsMinAggregateOutputType | null
    _max: PlayerStatsMaxAggregateOutputType | null
  }

  type GetPlayerStatsGroupByPayload<T extends PlayerStatsGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PlayerStatsGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PlayerStatsGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PlayerStatsGroupByOutputType[P]>
            : GetScalarType<T[P], PlayerStatsGroupByOutputType[P]>
        }
      >
    >


  export type PlayerStatsSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    playerId?: boolean
    matchId?: boolean
    statType?: boolean
    period?: boolean
    statisticsJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    match?: boolean | PlayerStats$matchArgs<ExtArgs>
  }, ExtArgs["result"]["playerStats"]>

  export type PlayerStatsSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    playerId?: boolean
    matchId?: boolean
    statType?: boolean
    period?: boolean
    statisticsJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | GameDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    match?: boolean | PlayerStats$matchArgs<ExtArgs>
  }, ExtArgs["result"]["playerStats"]>

  export type PlayerStatsSelectScalar = {
    id?: boolean
    gameId?: boolean
    playerId?: boolean
    matchId?: boolean
    statType?: boolean
    period?: boolean
    statisticsJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type PlayerStatsInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    match?: boolean | PlayerStats$matchArgs<ExtArgs>
  }
  export type PlayerStatsIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | GameDefaultArgs<ExtArgs>
    player?: boolean | PlayerDefaultArgs<ExtArgs>
    match?: boolean | PlayerStats$matchArgs<ExtArgs>
  }

  export type $PlayerStatsPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "PlayerStats"
    objects: {
      game: Prisma.$GamePayload<ExtArgs>
      player: Prisma.$PlayerPayload<ExtArgs>
      match: Prisma.$MatchPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string
      playerId: string
      matchId: string | null
      statType: string
      period: string | null
      statisticsJson: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["playerStats"]>
    composites: {}
  }

  type PlayerStatsGetPayload<S extends boolean | null | undefined | PlayerStatsDefaultArgs> = $Result.GetResult<Prisma.$PlayerStatsPayload, S>

  type PlayerStatsCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<PlayerStatsFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: PlayerStatsCountAggregateInputType | true
    }

  export interface PlayerStatsDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['PlayerStats'], meta: { name: 'PlayerStats' } }
    /**
     * Find zero or one PlayerStats that matches the filter.
     * @param {PlayerStatsFindUniqueArgs} args - Arguments to find a PlayerStats
     * @example
     * // Get one PlayerStats
     * const playerStats = await prisma.playerStats.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PlayerStatsFindUniqueArgs>(args: SelectSubset<T, PlayerStatsFindUniqueArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one PlayerStats that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {PlayerStatsFindUniqueOrThrowArgs} args - Arguments to find a PlayerStats
     * @example
     * // Get one PlayerStats
     * const playerStats = await prisma.playerStats.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PlayerStatsFindUniqueOrThrowArgs>(args: SelectSubset<T, PlayerStatsFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first PlayerStats that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsFindFirstArgs} args - Arguments to find a PlayerStats
     * @example
     * // Get one PlayerStats
     * const playerStats = await prisma.playerStats.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PlayerStatsFindFirstArgs>(args?: SelectSubset<T, PlayerStatsFindFirstArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first PlayerStats that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsFindFirstOrThrowArgs} args - Arguments to find a PlayerStats
     * @example
     * // Get one PlayerStats
     * const playerStats = await prisma.playerStats.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PlayerStatsFindFirstOrThrowArgs>(args?: SelectSubset<T, PlayerStatsFindFirstOrThrowArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more PlayerStats that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PlayerStats
     * const playerStats = await prisma.playerStats.findMany()
     * 
     * // Get first 10 PlayerStats
     * const playerStats = await prisma.playerStats.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const playerStatsWithIdOnly = await prisma.playerStats.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PlayerStatsFindManyArgs>(args?: SelectSubset<T, PlayerStatsFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a PlayerStats.
     * @param {PlayerStatsCreateArgs} args - Arguments to create a PlayerStats.
     * @example
     * // Create one PlayerStats
     * const PlayerStats = await prisma.playerStats.create({
     *   data: {
     *     // ... data to create a PlayerStats
     *   }
     * })
     * 
     */
    create<T extends PlayerStatsCreateArgs>(args: SelectSubset<T, PlayerStatsCreateArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many PlayerStats.
     * @param {PlayerStatsCreateManyArgs} args - Arguments to create many PlayerStats.
     * @example
     * // Create many PlayerStats
     * const playerStats = await prisma.playerStats.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PlayerStatsCreateManyArgs>(args?: SelectSubset<T, PlayerStatsCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many PlayerStats and returns the data saved in the database.
     * @param {PlayerStatsCreateManyAndReturnArgs} args - Arguments to create many PlayerStats.
     * @example
     * // Create many PlayerStats
     * const playerStats = await prisma.playerStats.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many PlayerStats and only return the `id`
     * const playerStatsWithIdOnly = await prisma.playerStats.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PlayerStatsCreateManyAndReturnArgs>(args?: SelectSubset<T, PlayerStatsCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a PlayerStats.
     * @param {PlayerStatsDeleteArgs} args - Arguments to delete one PlayerStats.
     * @example
     * // Delete one PlayerStats
     * const PlayerStats = await prisma.playerStats.delete({
     *   where: {
     *     // ... filter to delete one PlayerStats
     *   }
     * })
     * 
     */
    delete<T extends PlayerStatsDeleteArgs>(args: SelectSubset<T, PlayerStatsDeleteArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one PlayerStats.
     * @param {PlayerStatsUpdateArgs} args - Arguments to update one PlayerStats.
     * @example
     * // Update one PlayerStats
     * const playerStats = await prisma.playerStats.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PlayerStatsUpdateArgs>(args: SelectSubset<T, PlayerStatsUpdateArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more PlayerStats.
     * @param {PlayerStatsDeleteManyArgs} args - Arguments to filter PlayerStats to delete.
     * @example
     * // Delete a few PlayerStats
     * const { count } = await prisma.playerStats.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PlayerStatsDeleteManyArgs>(args?: SelectSubset<T, PlayerStatsDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PlayerStats.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PlayerStats
     * const playerStats = await prisma.playerStats.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PlayerStatsUpdateManyArgs>(args: SelectSubset<T, PlayerStatsUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one PlayerStats.
     * @param {PlayerStatsUpsertArgs} args - Arguments to update or create a PlayerStats.
     * @example
     * // Update or create a PlayerStats
     * const playerStats = await prisma.playerStats.upsert({
     *   create: {
     *     // ... data to create a PlayerStats
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PlayerStats we want to update
     *   }
     * })
     */
    upsert<T extends PlayerStatsUpsertArgs>(args: SelectSubset<T, PlayerStatsUpsertArgs<ExtArgs>>): Prisma__PlayerStatsClient<$Result.GetResult<Prisma.$PlayerStatsPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of PlayerStats.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsCountArgs} args - Arguments to filter PlayerStats to count.
     * @example
     * // Count the number of PlayerStats
     * const count = await prisma.playerStats.count({
     *   where: {
     *     // ... the filter for the PlayerStats we want to count
     *   }
     * })
    **/
    count<T extends PlayerStatsCountArgs>(
      args?: Subset<T, PlayerStatsCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PlayerStatsCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a PlayerStats.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PlayerStatsAggregateArgs>(args: Subset<T, PlayerStatsAggregateArgs>): Prisma.PrismaPromise<GetPlayerStatsAggregateType<T>>

    /**
     * Group by PlayerStats.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PlayerStatsGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PlayerStatsGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PlayerStatsGroupByArgs['orderBy'] }
        : { orderBy?: PlayerStatsGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PlayerStatsGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPlayerStatsGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the PlayerStats model
   */
  readonly fields: PlayerStatsFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for PlayerStats.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PlayerStatsClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends GameDefaultArgs<ExtArgs> = {}>(args?: Subset<T, GameDefaultArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    player<T extends PlayerDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PlayerDefaultArgs<ExtArgs>>): Prisma__PlayerClient<$Result.GetResult<Prisma.$PlayerPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    match<T extends PlayerStats$matchArgs<ExtArgs> = {}>(args?: Subset<T, PlayerStats$matchArgs<ExtArgs>>): Prisma__MatchClient<$Result.GetResult<Prisma.$MatchPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the PlayerStats model
   */ 
  interface PlayerStatsFieldRefs {
    readonly id: FieldRef<"PlayerStats", 'String'>
    readonly gameId: FieldRef<"PlayerStats", 'String'>
    readonly playerId: FieldRef<"PlayerStats", 'String'>
    readonly matchId: FieldRef<"PlayerStats", 'String'>
    readonly statType: FieldRef<"PlayerStats", 'String'>
    readonly period: FieldRef<"PlayerStats", 'String'>
    readonly statisticsJson: FieldRef<"PlayerStats", 'String'>
    readonly createdAt: FieldRef<"PlayerStats", 'DateTime'>
    readonly updatedAt: FieldRef<"PlayerStats", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * PlayerStats findUnique
   */
  export type PlayerStatsFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * Filter, which PlayerStats to fetch.
     */
    where: PlayerStatsWhereUniqueInput
  }

  /**
   * PlayerStats findUniqueOrThrow
   */
  export type PlayerStatsFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * Filter, which PlayerStats to fetch.
     */
    where: PlayerStatsWhereUniqueInput
  }

  /**
   * PlayerStats findFirst
   */
  export type PlayerStatsFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * Filter, which PlayerStats to fetch.
     */
    where?: PlayerStatsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlayerStats to fetch.
     */
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PlayerStats.
     */
    cursor?: PlayerStatsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlayerStats from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlayerStats.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PlayerStats.
     */
    distinct?: PlayerStatsScalarFieldEnum | PlayerStatsScalarFieldEnum[]
  }

  /**
   * PlayerStats findFirstOrThrow
   */
  export type PlayerStatsFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * Filter, which PlayerStats to fetch.
     */
    where?: PlayerStatsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlayerStats to fetch.
     */
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PlayerStats.
     */
    cursor?: PlayerStatsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlayerStats from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlayerStats.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PlayerStats.
     */
    distinct?: PlayerStatsScalarFieldEnum | PlayerStatsScalarFieldEnum[]
  }

  /**
   * PlayerStats findMany
   */
  export type PlayerStatsFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * Filter, which PlayerStats to fetch.
     */
    where?: PlayerStatsWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PlayerStats to fetch.
     */
    orderBy?: PlayerStatsOrderByWithRelationInput | PlayerStatsOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing PlayerStats.
     */
    cursor?: PlayerStatsWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PlayerStats from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PlayerStats.
     */
    skip?: number
    distinct?: PlayerStatsScalarFieldEnum | PlayerStatsScalarFieldEnum[]
  }

  /**
   * PlayerStats create
   */
  export type PlayerStatsCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * The data needed to create a PlayerStats.
     */
    data: XOR<PlayerStatsCreateInput, PlayerStatsUncheckedCreateInput>
  }

  /**
   * PlayerStats createMany
   */
  export type PlayerStatsCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many PlayerStats.
     */
    data: PlayerStatsCreateManyInput | PlayerStatsCreateManyInput[]
  }

  /**
   * PlayerStats createManyAndReturn
   */
  export type PlayerStatsCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many PlayerStats.
     */
    data: PlayerStatsCreateManyInput | PlayerStatsCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * PlayerStats update
   */
  export type PlayerStatsUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * The data needed to update a PlayerStats.
     */
    data: XOR<PlayerStatsUpdateInput, PlayerStatsUncheckedUpdateInput>
    /**
     * Choose, which PlayerStats to update.
     */
    where: PlayerStatsWhereUniqueInput
  }

  /**
   * PlayerStats updateMany
   */
  export type PlayerStatsUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update PlayerStats.
     */
    data: XOR<PlayerStatsUpdateManyMutationInput, PlayerStatsUncheckedUpdateManyInput>
    /**
     * Filter which PlayerStats to update
     */
    where?: PlayerStatsWhereInput
  }

  /**
   * PlayerStats upsert
   */
  export type PlayerStatsUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * The filter to search for the PlayerStats to update in case it exists.
     */
    where: PlayerStatsWhereUniqueInput
    /**
     * In case the PlayerStats found by the `where` argument doesn't exist, create a new PlayerStats with this data.
     */
    create: XOR<PlayerStatsCreateInput, PlayerStatsUncheckedCreateInput>
    /**
     * In case the PlayerStats was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PlayerStatsUpdateInput, PlayerStatsUncheckedUpdateInput>
  }

  /**
   * PlayerStats delete
   */
  export type PlayerStatsDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
    /**
     * Filter which PlayerStats to delete.
     */
    where: PlayerStatsWhereUniqueInput
  }

  /**
   * PlayerStats deleteMany
   */
  export type PlayerStatsDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PlayerStats to delete
     */
    where?: PlayerStatsWhereInput
  }

  /**
   * PlayerStats.match
   */
  export type PlayerStats$matchArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Match
     */
    select?: MatchSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: MatchInclude<ExtArgs> | null
    where?: MatchWhereInput
  }

  /**
   * PlayerStats without action
   */
  export type PlayerStatsDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PlayerStats
     */
    select?: PlayerStatsSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PlayerStatsInclude<ExtArgs> | null
  }


  /**
   * Model JobQueue
   */

  export type AggregateJobQueue = {
    _count: JobQueueCountAggregateOutputType | null
    _avg: JobQueueAvgAggregateOutputType | null
    _sum: JobQueueSumAggregateOutputType | null
    _min: JobQueueMinAggregateOutputType | null
    _max: JobQueueMaxAggregateOutputType | null
  }

  export type JobQueueAvgAggregateOutputType = {
    priority: number | null
    attempts: number | null
    maxAttempts: number | null
  }

  export type JobQueueSumAggregateOutputType = {
    priority: number | null
    attempts: number | null
    maxAttempts: number | null
  }

  export type JobQueueMinAggregateOutputType = {
    id: string | null
    gameId: string | null
    jobType: string | null
    status: string | null
    priority: number | null
    payload: string | null
    attempts: number | null
    maxAttempts: number | null
    error: string | null
    scheduledAt: Date | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type JobQueueMaxAggregateOutputType = {
    id: string | null
    gameId: string | null
    jobType: string | null
    status: string | null
    priority: number | null
    payload: string | null
    attempts: number | null
    maxAttempts: number | null
    error: string | null
    scheduledAt: Date | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type JobQueueCountAggregateOutputType = {
    id: number
    gameId: number
    jobType: number
    status: number
    priority: number
    payload: number
    attempts: number
    maxAttempts: number
    error: number
    scheduledAt: number
    startedAt: number
    completedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type JobQueueAvgAggregateInputType = {
    priority?: true
    attempts?: true
    maxAttempts?: true
  }

  export type JobQueueSumAggregateInputType = {
    priority?: true
    attempts?: true
    maxAttempts?: true
  }

  export type JobQueueMinAggregateInputType = {
    id?: true
    gameId?: true
    jobType?: true
    status?: true
    priority?: true
    payload?: true
    attempts?: true
    maxAttempts?: true
    error?: true
    scheduledAt?: true
    startedAt?: true
    completedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type JobQueueMaxAggregateInputType = {
    id?: true
    gameId?: true
    jobType?: true
    status?: true
    priority?: true
    payload?: true
    attempts?: true
    maxAttempts?: true
    error?: true
    scheduledAt?: true
    startedAt?: true
    completedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type JobQueueCountAggregateInputType = {
    id?: true
    gameId?: true
    jobType?: true
    status?: true
    priority?: true
    payload?: true
    attempts?: true
    maxAttempts?: true
    error?: true
    scheduledAt?: true
    startedAt?: true
    completedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type JobQueueAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which JobQueue to aggregate.
     */
    where?: JobQueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of JobQueues to fetch.
     */
    orderBy?: JobQueueOrderByWithRelationInput | JobQueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: JobQueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` JobQueues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` JobQueues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned JobQueues
    **/
    _count?: true | JobQueueCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: JobQueueAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: JobQueueSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: JobQueueMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: JobQueueMaxAggregateInputType
  }

  export type GetJobQueueAggregateType<T extends JobQueueAggregateArgs> = {
        [P in keyof T & keyof AggregateJobQueue]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateJobQueue[P]>
      : GetScalarType<T[P], AggregateJobQueue[P]>
  }




  export type JobQueueGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: JobQueueWhereInput
    orderBy?: JobQueueOrderByWithAggregationInput | JobQueueOrderByWithAggregationInput[]
    by: JobQueueScalarFieldEnum[] | JobQueueScalarFieldEnum
    having?: JobQueueScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: JobQueueCountAggregateInputType | true
    _avg?: JobQueueAvgAggregateInputType
    _sum?: JobQueueSumAggregateInputType
    _min?: JobQueueMinAggregateInputType
    _max?: JobQueueMaxAggregateInputType
  }

  export type JobQueueGroupByOutputType = {
    id: string
    gameId: string | null
    jobType: string
    status: string
    priority: number
    payload: string | null
    attempts: number
    maxAttempts: number
    error: string | null
    scheduledAt: Date
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: JobQueueCountAggregateOutputType | null
    _avg: JobQueueAvgAggregateOutputType | null
    _sum: JobQueueSumAggregateOutputType | null
    _min: JobQueueMinAggregateOutputType | null
    _max: JobQueueMaxAggregateOutputType | null
  }

  type GetJobQueueGroupByPayload<T extends JobQueueGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<JobQueueGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof JobQueueGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], JobQueueGroupByOutputType[P]>
            : GetScalarType<T[P], JobQueueGroupByOutputType[P]>
        }
      >
    >


  export type JobQueueSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    jobType?: boolean
    status?: boolean
    priority?: boolean
    payload?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    error?: boolean
    scheduledAt?: boolean
    startedAt?: boolean
    completedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | JobQueue$gameArgs<ExtArgs>
  }, ExtArgs["result"]["jobQueue"]>

  export type JobQueueSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    gameId?: boolean
    jobType?: boolean
    status?: boolean
    priority?: boolean
    payload?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    error?: boolean
    scheduledAt?: boolean
    startedAt?: boolean
    completedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    game?: boolean | JobQueue$gameArgs<ExtArgs>
  }, ExtArgs["result"]["jobQueue"]>

  export type JobQueueSelectScalar = {
    id?: boolean
    gameId?: boolean
    jobType?: boolean
    status?: boolean
    priority?: boolean
    payload?: boolean
    attempts?: boolean
    maxAttempts?: boolean
    error?: boolean
    scheduledAt?: boolean
    startedAt?: boolean
    completedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type JobQueueInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | JobQueue$gameArgs<ExtArgs>
  }
  export type JobQueueIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    game?: boolean | JobQueue$gameArgs<ExtArgs>
  }

  export type $JobQueuePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "JobQueue"
    objects: {
      game: Prisma.$GamePayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      gameId: string | null
      jobType: string
      status: string
      priority: number
      payload: string | null
      attempts: number
      maxAttempts: number
      error: string | null
      scheduledAt: Date
      startedAt: Date | null
      completedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["jobQueue"]>
    composites: {}
  }

  type JobQueueGetPayload<S extends boolean | null | undefined | JobQueueDefaultArgs> = $Result.GetResult<Prisma.$JobQueuePayload, S>

  type JobQueueCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<JobQueueFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: JobQueueCountAggregateInputType | true
    }

  export interface JobQueueDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['JobQueue'], meta: { name: 'JobQueue' } }
    /**
     * Find zero or one JobQueue that matches the filter.
     * @param {JobQueueFindUniqueArgs} args - Arguments to find a JobQueue
     * @example
     * // Get one JobQueue
     * const jobQueue = await prisma.jobQueue.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends JobQueueFindUniqueArgs>(args: SelectSubset<T, JobQueueFindUniqueArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one JobQueue that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {JobQueueFindUniqueOrThrowArgs} args - Arguments to find a JobQueue
     * @example
     * // Get one JobQueue
     * const jobQueue = await prisma.jobQueue.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends JobQueueFindUniqueOrThrowArgs>(args: SelectSubset<T, JobQueueFindUniqueOrThrowArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first JobQueue that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueFindFirstArgs} args - Arguments to find a JobQueue
     * @example
     * // Get one JobQueue
     * const jobQueue = await prisma.jobQueue.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends JobQueueFindFirstArgs>(args?: SelectSubset<T, JobQueueFindFirstArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first JobQueue that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueFindFirstOrThrowArgs} args - Arguments to find a JobQueue
     * @example
     * // Get one JobQueue
     * const jobQueue = await prisma.jobQueue.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends JobQueueFindFirstOrThrowArgs>(args?: SelectSubset<T, JobQueueFindFirstOrThrowArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more JobQueues that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all JobQueues
     * const jobQueues = await prisma.jobQueue.findMany()
     * 
     * // Get first 10 JobQueues
     * const jobQueues = await prisma.jobQueue.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const jobQueueWithIdOnly = await prisma.jobQueue.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends JobQueueFindManyArgs>(args?: SelectSubset<T, JobQueueFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "findMany">>

    /**
     * Create a JobQueue.
     * @param {JobQueueCreateArgs} args - Arguments to create a JobQueue.
     * @example
     * // Create one JobQueue
     * const JobQueue = await prisma.jobQueue.create({
     *   data: {
     *     // ... data to create a JobQueue
     *   }
     * })
     * 
     */
    create<T extends JobQueueCreateArgs>(args: SelectSubset<T, JobQueueCreateArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many JobQueues.
     * @param {JobQueueCreateManyArgs} args - Arguments to create many JobQueues.
     * @example
     * // Create many JobQueues
     * const jobQueue = await prisma.jobQueue.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends JobQueueCreateManyArgs>(args?: SelectSubset<T, JobQueueCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many JobQueues and returns the data saved in the database.
     * @param {JobQueueCreateManyAndReturnArgs} args - Arguments to create many JobQueues.
     * @example
     * // Create many JobQueues
     * const jobQueue = await prisma.jobQueue.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many JobQueues and only return the `id`
     * const jobQueueWithIdOnly = await prisma.jobQueue.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends JobQueueCreateManyAndReturnArgs>(args?: SelectSubset<T, JobQueueCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a JobQueue.
     * @param {JobQueueDeleteArgs} args - Arguments to delete one JobQueue.
     * @example
     * // Delete one JobQueue
     * const JobQueue = await prisma.jobQueue.delete({
     *   where: {
     *     // ... filter to delete one JobQueue
     *   }
     * })
     * 
     */
    delete<T extends JobQueueDeleteArgs>(args: SelectSubset<T, JobQueueDeleteArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one JobQueue.
     * @param {JobQueueUpdateArgs} args - Arguments to update one JobQueue.
     * @example
     * // Update one JobQueue
     * const jobQueue = await prisma.jobQueue.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends JobQueueUpdateArgs>(args: SelectSubset<T, JobQueueUpdateArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more JobQueues.
     * @param {JobQueueDeleteManyArgs} args - Arguments to filter JobQueues to delete.
     * @example
     * // Delete a few JobQueues
     * const { count } = await prisma.jobQueue.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends JobQueueDeleteManyArgs>(args?: SelectSubset<T, JobQueueDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more JobQueues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many JobQueues
     * const jobQueue = await prisma.jobQueue.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends JobQueueUpdateManyArgs>(args: SelectSubset<T, JobQueueUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one JobQueue.
     * @param {JobQueueUpsertArgs} args - Arguments to update or create a JobQueue.
     * @example
     * // Update or create a JobQueue
     * const jobQueue = await prisma.jobQueue.upsert({
     *   create: {
     *     // ... data to create a JobQueue
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the JobQueue we want to update
     *   }
     * })
     */
    upsert<T extends JobQueueUpsertArgs>(args: SelectSubset<T, JobQueueUpsertArgs<ExtArgs>>): Prisma__JobQueueClient<$Result.GetResult<Prisma.$JobQueuePayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of JobQueues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueCountArgs} args - Arguments to filter JobQueues to count.
     * @example
     * // Count the number of JobQueues
     * const count = await prisma.jobQueue.count({
     *   where: {
     *     // ... the filter for the JobQueues we want to count
     *   }
     * })
    **/
    count<T extends JobQueueCountArgs>(
      args?: Subset<T, JobQueueCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], JobQueueCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a JobQueue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends JobQueueAggregateArgs>(args: Subset<T, JobQueueAggregateArgs>): Prisma.PrismaPromise<GetJobQueueAggregateType<T>>

    /**
     * Group by JobQueue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {JobQueueGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends JobQueueGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: JobQueueGroupByArgs['orderBy'] }
        : { orderBy?: JobQueueGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, JobQueueGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetJobQueueGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the JobQueue model
   */
  readonly fields: JobQueueFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for JobQueue.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__JobQueueClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    game<T extends JobQueue$gameArgs<ExtArgs> = {}>(args?: Subset<T, JobQueue$gameArgs<ExtArgs>>): Prisma__GameClient<$Result.GetResult<Prisma.$GamePayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the JobQueue model
   */ 
  interface JobQueueFieldRefs {
    readonly id: FieldRef<"JobQueue", 'String'>
    readonly gameId: FieldRef<"JobQueue", 'String'>
    readonly jobType: FieldRef<"JobQueue", 'String'>
    readonly status: FieldRef<"JobQueue", 'String'>
    readonly priority: FieldRef<"JobQueue", 'Int'>
    readonly payload: FieldRef<"JobQueue", 'String'>
    readonly attempts: FieldRef<"JobQueue", 'Int'>
    readonly maxAttempts: FieldRef<"JobQueue", 'Int'>
    readonly error: FieldRef<"JobQueue", 'String'>
    readonly scheduledAt: FieldRef<"JobQueue", 'DateTime'>
    readonly startedAt: FieldRef<"JobQueue", 'DateTime'>
    readonly completedAt: FieldRef<"JobQueue", 'DateTime'>
    readonly createdAt: FieldRef<"JobQueue", 'DateTime'>
    readonly updatedAt: FieldRef<"JobQueue", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * JobQueue findUnique
   */
  export type JobQueueFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * Filter, which JobQueue to fetch.
     */
    where: JobQueueWhereUniqueInput
  }

  /**
   * JobQueue findUniqueOrThrow
   */
  export type JobQueueFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * Filter, which JobQueue to fetch.
     */
    where: JobQueueWhereUniqueInput
  }

  /**
   * JobQueue findFirst
   */
  export type JobQueueFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * Filter, which JobQueue to fetch.
     */
    where?: JobQueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of JobQueues to fetch.
     */
    orderBy?: JobQueueOrderByWithRelationInput | JobQueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for JobQueues.
     */
    cursor?: JobQueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` JobQueues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` JobQueues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of JobQueues.
     */
    distinct?: JobQueueScalarFieldEnum | JobQueueScalarFieldEnum[]
  }

  /**
   * JobQueue findFirstOrThrow
   */
  export type JobQueueFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * Filter, which JobQueue to fetch.
     */
    where?: JobQueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of JobQueues to fetch.
     */
    orderBy?: JobQueueOrderByWithRelationInput | JobQueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for JobQueues.
     */
    cursor?: JobQueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` JobQueues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` JobQueues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of JobQueues.
     */
    distinct?: JobQueueScalarFieldEnum | JobQueueScalarFieldEnum[]
  }

  /**
   * JobQueue findMany
   */
  export type JobQueueFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * Filter, which JobQueues to fetch.
     */
    where?: JobQueueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of JobQueues to fetch.
     */
    orderBy?: JobQueueOrderByWithRelationInput | JobQueueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing JobQueues.
     */
    cursor?: JobQueueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` JobQueues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` JobQueues.
     */
    skip?: number
    distinct?: JobQueueScalarFieldEnum | JobQueueScalarFieldEnum[]
  }

  /**
   * JobQueue create
   */
  export type JobQueueCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * The data needed to create a JobQueue.
     */
    data: XOR<JobQueueCreateInput, JobQueueUncheckedCreateInput>
  }

  /**
   * JobQueue createMany
   */
  export type JobQueueCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many JobQueues.
     */
    data: JobQueueCreateManyInput | JobQueueCreateManyInput[]
  }

  /**
   * JobQueue createManyAndReturn
   */
  export type JobQueueCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many JobQueues.
     */
    data: JobQueueCreateManyInput | JobQueueCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * JobQueue update
   */
  export type JobQueueUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * The data needed to update a JobQueue.
     */
    data: XOR<JobQueueUpdateInput, JobQueueUncheckedUpdateInput>
    /**
     * Choose, which JobQueue to update.
     */
    where: JobQueueWhereUniqueInput
  }

  /**
   * JobQueue updateMany
   */
  export type JobQueueUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update JobQueues.
     */
    data: XOR<JobQueueUpdateManyMutationInput, JobQueueUncheckedUpdateManyInput>
    /**
     * Filter which JobQueues to update
     */
    where?: JobQueueWhereInput
  }

  /**
   * JobQueue upsert
   */
  export type JobQueueUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * The filter to search for the JobQueue to update in case it exists.
     */
    where: JobQueueWhereUniqueInput
    /**
     * In case the JobQueue found by the `where` argument doesn't exist, create a new JobQueue with this data.
     */
    create: XOR<JobQueueCreateInput, JobQueueUncheckedCreateInput>
    /**
     * In case the JobQueue was found with the provided `where` argument, update it with this data.
     */
    update: XOR<JobQueueUpdateInput, JobQueueUncheckedUpdateInput>
  }

  /**
   * JobQueue delete
   */
  export type JobQueueDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
    /**
     * Filter which JobQueue to delete.
     */
    where: JobQueueWhereUniqueInput
  }

  /**
   * JobQueue deleteMany
   */
  export type JobQueueDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which JobQueues to delete
     */
    where?: JobQueueWhereInput
  }

  /**
   * JobQueue.game
   */
  export type JobQueue$gameArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Game
     */
    select?: GameSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameInclude<ExtArgs> | null
    where?: GameWhereInput
  }

  /**
   * JobQueue without action
   */
  export type JobQueueDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the JobQueue
     */
    select?: JobQueueSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: JobQueueInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const GameScalarFieldEnum: {
    id: 'id',
    name: 'name',
    displayName: 'displayName',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type GameScalarFieldEnum = (typeof GameScalarFieldEnum)[keyof typeof GameScalarFieldEnum]


  export const PlayerScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    username: 'username',
    displayName: 'displayName',
    userId: 'userId',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PlayerScalarFieldEnum = (typeof PlayerScalarFieldEnum)[keyof typeof PlayerScalarFieldEnum]


  export const CharacterScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    name: 'name',
    displayName: 'displayName',
    role: 'role',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type CharacterScalarFieldEnum = (typeof CharacterScalarFieldEnum)[keyof typeof CharacterScalarFieldEnum]


  export const MapScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    name: 'name',
    displayName: 'displayName',
    mapType: 'mapType',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type MapScalarFieldEnum = (typeof MapScalarFieldEnum)[keyof typeof MapScalarFieldEnum]


  export const GameModeScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    name: 'name',
    displayName: 'displayName',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type GameModeScalarFieldEnum = (typeof GameModeScalarFieldEnum)[keyof typeof GameModeScalarFieldEnum]


  export const MatchScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    mapId: 'mapId',
    gameModeId: 'gameModeId',
    matchCode: 'matchCode',
    startTime: 'startTime',
    endTime: 'endTime',
    status: 'status',
    metadata: 'metadata',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type MatchScalarFieldEnum = (typeof MatchScalarFieldEnum)[keyof typeof MatchScalarFieldEnum]


  export const MatchResultScalarFieldEnum: {
    id: 'id',
    matchId: 'matchId',
    playerId: 'playerId',
    characterId: 'characterId',
    team: 'team',
    result: 'result',
    score: 'score',
    placement: 'placement',
    statsJson: 'statsJson',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type MatchResultScalarFieldEnum = (typeof MatchResultScalarFieldEnum)[keyof typeof MatchResultScalarFieldEnum]


  export const PlayerStatsScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    playerId: 'playerId',
    matchId: 'matchId',
    statType: 'statType',
    period: 'period',
    statisticsJson: 'statisticsJson',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PlayerStatsScalarFieldEnum = (typeof PlayerStatsScalarFieldEnum)[keyof typeof PlayerStatsScalarFieldEnum]


  export const JobQueueScalarFieldEnum: {
    id: 'id',
    gameId: 'gameId',
    jobType: 'jobType',
    status: 'status',
    priority: 'priority',
    payload: 'payload',
    attempts: 'attempts',
    maxAttempts: 'maxAttempts',
    error: 'error',
    scheduledAt: 'scheduledAt',
    startedAt: 'startedAt',
    completedAt: 'completedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type JobQueueScalarFieldEnum = (typeof JobQueueScalarFieldEnum)[keyof typeof JobQueueScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    
  /**
   * Deep Input Types
   */


  export type GameWhereInput = {
    AND?: GameWhereInput | GameWhereInput[]
    OR?: GameWhereInput[]
    NOT?: GameWhereInput | GameWhereInput[]
    id?: StringFilter<"Game"> | string
    name?: StringFilter<"Game"> | string
    displayName?: StringFilter<"Game"> | string
    isActive?: BoolFilter<"Game"> | boolean
    createdAt?: DateTimeFilter<"Game"> | Date | string
    updatedAt?: DateTimeFilter<"Game"> | Date | string
    players?: PlayerListRelationFilter
    matches?: MatchListRelationFilter
    characters?: CharacterListRelationFilter
    maps?: MapListRelationFilter
    gameModes?: GameModeListRelationFilter
    playerStats?: PlayerStatsListRelationFilter
    jobQueue?: JobQueueListRelationFilter
  }

  export type GameOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    players?: PlayerOrderByRelationAggregateInput
    matches?: MatchOrderByRelationAggregateInput
    characters?: CharacterOrderByRelationAggregateInput
    maps?: MapOrderByRelationAggregateInput
    gameModes?: GameModeOrderByRelationAggregateInput
    playerStats?: PlayerStatsOrderByRelationAggregateInput
    jobQueue?: JobQueueOrderByRelationAggregateInput
  }

  export type GameWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    name?: string
    AND?: GameWhereInput | GameWhereInput[]
    OR?: GameWhereInput[]
    NOT?: GameWhereInput | GameWhereInput[]
    displayName?: StringFilter<"Game"> | string
    isActive?: BoolFilter<"Game"> | boolean
    createdAt?: DateTimeFilter<"Game"> | Date | string
    updatedAt?: DateTimeFilter<"Game"> | Date | string
    players?: PlayerListRelationFilter
    matches?: MatchListRelationFilter
    characters?: CharacterListRelationFilter
    maps?: MapListRelationFilter
    gameModes?: GameModeListRelationFilter
    playerStats?: PlayerStatsListRelationFilter
    jobQueue?: JobQueueListRelationFilter
  }, "id" | "name">

  export type GameOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: GameCountOrderByAggregateInput
    _max?: GameMaxOrderByAggregateInput
    _min?: GameMinOrderByAggregateInput
  }

  export type GameScalarWhereWithAggregatesInput = {
    AND?: GameScalarWhereWithAggregatesInput | GameScalarWhereWithAggregatesInput[]
    OR?: GameScalarWhereWithAggregatesInput[]
    NOT?: GameScalarWhereWithAggregatesInput | GameScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Game"> | string
    name?: StringWithAggregatesFilter<"Game"> | string
    displayName?: StringWithAggregatesFilter<"Game"> | string
    isActive?: BoolWithAggregatesFilter<"Game"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"Game"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Game"> | Date | string
  }

  export type PlayerWhereInput = {
    AND?: PlayerWhereInput | PlayerWhereInput[]
    OR?: PlayerWhereInput[]
    NOT?: PlayerWhereInput | PlayerWhereInput[]
    id?: StringFilter<"Player"> | string
    gameId?: StringFilter<"Player"> | string
    username?: StringFilter<"Player"> | string
    displayName?: StringNullableFilter<"Player"> | string | null
    userId?: StringNullableFilter<"Player"> | string | null
    isActive?: BoolFilter<"Player"> | boolean
    createdAt?: DateTimeFilter<"Player"> | Date | string
    updatedAt?: DateTimeFilter<"Player"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    playerStats?: PlayerStatsListRelationFilter
    matchResults?: MatchResultListRelationFilter
  }

  export type PlayerOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrder
    username?: SortOrder
    displayName?: SortOrderInput | SortOrder
    userId?: SortOrderInput | SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
    playerStats?: PlayerStatsOrderByRelationAggregateInput
    matchResults?: MatchResultOrderByRelationAggregateInput
  }

  export type PlayerWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    gameId_username?: PlayerGameIdUsernameCompoundUniqueInput
    AND?: PlayerWhereInput | PlayerWhereInput[]
    OR?: PlayerWhereInput[]
    NOT?: PlayerWhereInput | PlayerWhereInput[]
    gameId?: StringFilter<"Player"> | string
    username?: StringFilter<"Player"> | string
    displayName?: StringNullableFilter<"Player"> | string | null
    userId?: StringNullableFilter<"Player"> | string | null
    isActive?: BoolFilter<"Player"> | boolean
    createdAt?: DateTimeFilter<"Player"> | Date | string
    updatedAt?: DateTimeFilter<"Player"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    playerStats?: PlayerStatsListRelationFilter
    matchResults?: MatchResultListRelationFilter
  }, "id" | "gameId_username">

  export type PlayerOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrder
    username?: SortOrder
    displayName?: SortOrderInput | SortOrder
    userId?: SortOrderInput | SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PlayerCountOrderByAggregateInput
    _max?: PlayerMaxOrderByAggregateInput
    _min?: PlayerMinOrderByAggregateInput
  }

  export type PlayerScalarWhereWithAggregatesInput = {
    AND?: PlayerScalarWhereWithAggregatesInput | PlayerScalarWhereWithAggregatesInput[]
    OR?: PlayerScalarWhereWithAggregatesInput[]
    NOT?: PlayerScalarWhereWithAggregatesInput | PlayerScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Player"> | string
    gameId?: StringWithAggregatesFilter<"Player"> | string
    username?: StringWithAggregatesFilter<"Player"> | string
    displayName?: StringNullableWithAggregatesFilter<"Player"> | string | null
    userId?: StringNullableWithAggregatesFilter<"Player"> | string | null
    isActive?: BoolWithAggregatesFilter<"Player"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"Player"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Player"> | Date | string
  }

  export type CharacterWhereInput = {
    AND?: CharacterWhereInput | CharacterWhereInput[]
    OR?: CharacterWhereInput[]
    NOT?: CharacterWhereInput | CharacterWhereInput[]
    id?: StringFilter<"Character"> | string
    gameId?: StringFilter<"Character"> | string
    name?: StringFilter<"Character"> | string
    displayName?: StringFilter<"Character"> | string
    role?: StringFilter<"Character"> | string
    isActive?: BoolFilter<"Character"> | boolean
    createdAt?: DateTimeFilter<"Character"> | Date | string
    updatedAt?: DateTimeFilter<"Character"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    matchResults?: MatchResultListRelationFilter
  }

  export type CharacterOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    role?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
    matchResults?: MatchResultOrderByRelationAggregateInput
  }

  export type CharacterWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    gameId_name?: CharacterGameIdNameCompoundUniqueInput
    AND?: CharacterWhereInput | CharacterWhereInput[]
    OR?: CharacterWhereInput[]
    NOT?: CharacterWhereInput | CharacterWhereInput[]
    gameId?: StringFilter<"Character"> | string
    name?: StringFilter<"Character"> | string
    displayName?: StringFilter<"Character"> | string
    role?: StringFilter<"Character"> | string
    isActive?: BoolFilter<"Character"> | boolean
    createdAt?: DateTimeFilter<"Character"> | Date | string
    updatedAt?: DateTimeFilter<"Character"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    matchResults?: MatchResultListRelationFilter
  }, "id" | "gameId_name">

  export type CharacterOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    role?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: CharacterCountOrderByAggregateInput
    _max?: CharacterMaxOrderByAggregateInput
    _min?: CharacterMinOrderByAggregateInput
  }

  export type CharacterScalarWhereWithAggregatesInput = {
    AND?: CharacterScalarWhereWithAggregatesInput | CharacterScalarWhereWithAggregatesInput[]
    OR?: CharacterScalarWhereWithAggregatesInput[]
    NOT?: CharacterScalarWhereWithAggregatesInput | CharacterScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Character"> | string
    gameId?: StringWithAggregatesFilter<"Character"> | string
    name?: StringWithAggregatesFilter<"Character"> | string
    displayName?: StringWithAggregatesFilter<"Character"> | string
    role?: StringWithAggregatesFilter<"Character"> | string
    isActive?: BoolWithAggregatesFilter<"Character"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"Character"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Character"> | Date | string
  }

  export type MapWhereInput = {
    AND?: MapWhereInput | MapWhereInput[]
    OR?: MapWhereInput[]
    NOT?: MapWhereInput | MapWhereInput[]
    id?: StringFilter<"Map"> | string
    gameId?: StringFilter<"Map"> | string
    name?: StringFilter<"Map"> | string
    displayName?: StringFilter<"Map"> | string
    mapType?: StringFilter<"Map"> | string
    isActive?: BoolFilter<"Map"> | boolean
    createdAt?: DateTimeFilter<"Map"> | Date | string
    updatedAt?: DateTimeFilter<"Map"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    matches?: MatchListRelationFilter
  }

  export type MapOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    mapType?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
    matches?: MatchOrderByRelationAggregateInput
  }

  export type MapWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    gameId_name?: MapGameIdNameCompoundUniqueInput
    AND?: MapWhereInput | MapWhereInput[]
    OR?: MapWhereInput[]
    NOT?: MapWhereInput | MapWhereInput[]
    gameId?: StringFilter<"Map"> | string
    name?: StringFilter<"Map"> | string
    displayName?: StringFilter<"Map"> | string
    mapType?: StringFilter<"Map"> | string
    isActive?: BoolFilter<"Map"> | boolean
    createdAt?: DateTimeFilter<"Map"> | Date | string
    updatedAt?: DateTimeFilter<"Map"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    matches?: MatchListRelationFilter
  }, "id" | "gameId_name">

  export type MapOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    mapType?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: MapCountOrderByAggregateInput
    _max?: MapMaxOrderByAggregateInput
    _min?: MapMinOrderByAggregateInput
  }

  export type MapScalarWhereWithAggregatesInput = {
    AND?: MapScalarWhereWithAggregatesInput | MapScalarWhereWithAggregatesInput[]
    OR?: MapScalarWhereWithAggregatesInput[]
    NOT?: MapScalarWhereWithAggregatesInput | MapScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Map"> | string
    gameId?: StringWithAggregatesFilter<"Map"> | string
    name?: StringWithAggregatesFilter<"Map"> | string
    displayName?: StringWithAggregatesFilter<"Map"> | string
    mapType?: StringWithAggregatesFilter<"Map"> | string
    isActive?: BoolWithAggregatesFilter<"Map"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"Map"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Map"> | Date | string
  }

  export type GameModeWhereInput = {
    AND?: GameModeWhereInput | GameModeWhereInput[]
    OR?: GameModeWhereInput[]
    NOT?: GameModeWhereInput | GameModeWhereInput[]
    id?: StringFilter<"GameMode"> | string
    gameId?: StringFilter<"GameMode"> | string
    name?: StringFilter<"GameMode"> | string
    displayName?: StringFilter<"GameMode"> | string
    isActive?: BoolFilter<"GameMode"> | boolean
    createdAt?: DateTimeFilter<"GameMode"> | Date | string
    updatedAt?: DateTimeFilter<"GameMode"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    matches?: MatchListRelationFilter
  }

  export type GameModeOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
    matches?: MatchOrderByRelationAggregateInput
  }

  export type GameModeWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    gameId_name?: GameModeGameIdNameCompoundUniqueInput
    AND?: GameModeWhereInput | GameModeWhereInput[]
    OR?: GameModeWhereInput[]
    NOT?: GameModeWhereInput | GameModeWhereInput[]
    gameId?: StringFilter<"GameMode"> | string
    name?: StringFilter<"GameMode"> | string
    displayName?: StringFilter<"GameMode"> | string
    isActive?: BoolFilter<"GameMode"> | boolean
    createdAt?: DateTimeFilter<"GameMode"> | Date | string
    updatedAt?: DateTimeFilter<"GameMode"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    matches?: MatchListRelationFilter
  }, "id" | "gameId_name">

  export type GameModeOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: GameModeCountOrderByAggregateInput
    _max?: GameModeMaxOrderByAggregateInput
    _min?: GameModeMinOrderByAggregateInput
  }

  export type GameModeScalarWhereWithAggregatesInput = {
    AND?: GameModeScalarWhereWithAggregatesInput | GameModeScalarWhereWithAggregatesInput[]
    OR?: GameModeScalarWhereWithAggregatesInput[]
    NOT?: GameModeScalarWhereWithAggregatesInput | GameModeScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"GameMode"> | string
    gameId?: StringWithAggregatesFilter<"GameMode"> | string
    name?: StringWithAggregatesFilter<"GameMode"> | string
    displayName?: StringWithAggregatesFilter<"GameMode"> | string
    isActive?: BoolWithAggregatesFilter<"GameMode"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"GameMode"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"GameMode"> | Date | string
  }

  export type MatchWhereInput = {
    AND?: MatchWhereInput | MatchWhereInput[]
    OR?: MatchWhereInput[]
    NOT?: MatchWhereInput | MatchWhereInput[]
    id?: StringFilter<"Match"> | string
    gameId?: StringFilter<"Match"> | string
    mapId?: StringNullableFilter<"Match"> | string | null
    gameModeId?: StringNullableFilter<"Match"> | string | null
    matchCode?: StringNullableFilter<"Match"> | string | null
    startTime?: DateTimeFilter<"Match"> | Date | string
    endTime?: DateTimeNullableFilter<"Match"> | Date | string | null
    status?: StringFilter<"Match"> | string
    metadata?: StringNullableFilter<"Match"> | string | null
    createdAt?: DateTimeFilter<"Match"> | Date | string
    updatedAt?: DateTimeFilter<"Match"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    map?: XOR<MapNullableRelationFilter, MapWhereInput> | null
    gameMode?: XOR<GameModeNullableRelationFilter, GameModeWhereInput> | null
    matchResults?: MatchResultListRelationFilter
    playerStats?: PlayerStatsListRelationFilter
  }

  export type MatchOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrder
    mapId?: SortOrderInput | SortOrder
    gameModeId?: SortOrderInput | SortOrder
    matchCode?: SortOrderInput | SortOrder
    startTime?: SortOrder
    endTime?: SortOrderInput | SortOrder
    status?: SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
    map?: MapOrderByWithRelationInput
    gameMode?: GameModeOrderByWithRelationInput
    matchResults?: MatchResultOrderByRelationAggregateInput
    playerStats?: PlayerStatsOrderByRelationAggregateInput
  }

  export type MatchWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: MatchWhereInput | MatchWhereInput[]
    OR?: MatchWhereInput[]
    NOT?: MatchWhereInput | MatchWhereInput[]
    gameId?: StringFilter<"Match"> | string
    mapId?: StringNullableFilter<"Match"> | string | null
    gameModeId?: StringNullableFilter<"Match"> | string | null
    matchCode?: StringNullableFilter<"Match"> | string | null
    startTime?: DateTimeFilter<"Match"> | Date | string
    endTime?: DateTimeNullableFilter<"Match"> | Date | string | null
    status?: StringFilter<"Match"> | string
    metadata?: StringNullableFilter<"Match"> | string | null
    createdAt?: DateTimeFilter<"Match"> | Date | string
    updatedAt?: DateTimeFilter<"Match"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    map?: XOR<MapNullableRelationFilter, MapWhereInput> | null
    gameMode?: XOR<GameModeNullableRelationFilter, GameModeWhereInput> | null
    matchResults?: MatchResultListRelationFilter
    playerStats?: PlayerStatsListRelationFilter
  }, "id">

  export type MatchOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrder
    mapId?: SortOrderInput | SortOrder
    gameModeId?: SortOrderInput | SortOrder
    matchCode?: SortOrderInput | SortOrder
    startTime?: SortOrder
    endTime?: SortOrderInput | SortOrder
    status?: SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: MatchCountOrderByAggregateInput
    _max?: MatchMaxOrderByAggregateInput
    _min?: MatchMinOrderByAggregateInput
  }

  export type MatchScalarWhereWithAggregatesInput = {
    AND?: MatchScalarWhereWithAggregatesInput | MatchScalarWhereWithAggregatesInput[]
    OR?: MatchScalarWhereWithAggregatesInput[]
    NOT?: MatchScalarWhereWithAggregatesInput | MatchScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Match"> | string
    gameId?: StringWithAggregatesFilter<"Match"> | string
    mapId?: StringNullableWithAggregatesFilter<"Match"> | string | null
    gameModeId?: StringNullableWithAggregatesFilter<"Match"> | string | null
    matchCode?: StringNullableWithAggregatesFilter<"Match"> | string | null
    startTime?: DateTimeWithAggregatesFilter<"Match"> | Date | string
    endTime?: DateTimeNullableWithAggregatesFilter<"Match"> | Date | string | null
    status?: StringWithAggregatesFilter<"Match"> | string
    metadata?: StringNullableWithAggregatesFilter<"Match"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Match"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Match"> | Date | string
  }

  export type MatchResultWhereInput = {
    AND?: MatchResultWhereInput | MatchResultWhereInput[]
    OR?: MatchResultWhereInput[]
    NOT?: MatchResultWhereInput | MatchResultWhereInput[]
    id?: StringFilter<"MatchResult"> | string
    matchId?: StringFilter<"MatchResult"> | string
    playerId?: StringFilter<"MatchResult"> | string
    characterId?: StringNullableFilter<"MatchResult"> | string | null
    team?: StringNullableFilter<"MatchResult"> | string | null
    result?: StringNullableFilter<"MatchResult"> | string | null
    score?: IntNullableFilter<"MatchResult"> | number | null
    placement?: IntNullableFilter<"MatchResult"> | number | null
    statsJson?: StringNullableFilter<"MatchResult"> | string | null
    createdAt?: DateTimeFilter<"MatchResult"> | Date | string
    updatedAt?: DateTimeFilter<"MatchResult"> | Date | string
    match?: XOR<MatchRelationFilter, MatchWhereInput>
    player?: XOR<PlayerRelationFilter, PlayerWhereInput>
    character?: XOR<CharacterNullableRelationFilter, CharacterWhereInput> | null
  }

  export type MatchResultOrderByWithRelationInput = {
    id?: SortOrder
    matchId?: SortOrder
    playerId?: SortOrder
    characterId?: SortOrderInput | SortOrder
    team?: SortOrderInput | SortOrder
    result?: SortOrderInput | SortOrder
    score?: SortOrderInput | SortOrder
    placement?: SortOrderInput | SortOrder
    statsJson?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    match?: MatchOrderByWithRelationInput
    player?: PlayerOrderByWithRelationInput
    character?: CharacterOrderByWithRelationInput
  }

  export type MatchResultWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    matchId_playerId?: MatchResultMatchIdPlayerIdCompoundUniqueInput
    AND?: MatchResultWhereInput | MatchResultWhereInput[]
    OR?: MatchResultWhereInput[]
    NOT?: MatchResultWhereInput | MatchResultWhereInput[]
    matchId?: StringFilter<"MatchResult"> | string
    playerId?: StringFilter<"MatchResult"> | string
    characterId?: StringNullableFilter<"MatchResult"> | string | null
    team?: StringNullableFilter<"MatchResult"> | string | null
    result?: StringNullableFilter<"MatchResult"> | string | null
    score?: IntNullableFilter<"MatchResult"> | number | null
    placement?: IntNullableFilter<"MatchResult"> | number | null
    statsJson?: StringNullableFilter<"MatchResult"> | string | null
    createdAt?: DateTimeFilter<"MatchResult"> | Date | string
    updatedAt?: DateTimeFilter<"MatchResult"> | Date | string
    match?: XOR<MatchRelationFilter, MatchWhereInput>
    player?: XOR<PlayerRelationFilter, PlayerWhereInput>
    character?: XOR<CharacterNullableRelationFilter, CharacterWhereInput> | null
  }, "id" | "matchId_playerId">

  export type MatchResultOrderByWithAggregationInput = {
    id?: SortOrder
    matchId?: SortOrder
    playerId?: SortOrder
    characterId?: SortOrderInput | SortOrder
    team?: SortOrderInput | SortOrder
    result?: SortOrderInput | SortOrder
    score?: SortOrderInput | SortOrder
    placement?: SortOrderInput | SortOrder
    statsJson?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: MatchResultCountOrderByAggregateInput
    _avg?: MatchResultAvgOrderByAggregateInput
    _max?: MatchResultMaxOrderByAggregateInput
    _min?: MatchResultMinOrderByAggregateInput
    _sum?: MatchResultSumOrderByAggregateInput
  }

  export type MatchResultScalarWhereWithAggregatesInput = {
    AND?: MatchResultScalarWhereWithAggregatesInput | MatchResultScalarWhereWithAggregatesInput[]
    OR?: MatchResultScalarWhereWithAggregatesInput[]
    NOT?: MatchResultScalarWhereWithAggregatesInput | MatchResultScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"MatchResult"> | string
    matchId?: StringWithAggregatesFilter<"MatchResult"> | string
    playerId?: StringWithAggregatesFilter<"MatchResult"> | string
    characterId?: StringNullableWithAggregatesFilter<"MatchResult"> | string | null
    team?: StringNullableWithAggregatesFilter<"MatchResult"> | string | null
    result?: StringNullableWithAggregatesFilter<"MatchResult"> | string | null
    score?: IntNullableWithAggregatesFilter<"MatchResult"> | number | null
    placement?: IntNullableWithAggregatesFilter<"MatchResult"> | number | null
    statsJson?: StringNullableWithAggregatesFilter<"MatchResult"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"MatchResult"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"MatchResult"> | Date | string
  }

  export type PlayerStatsWhereInput = {
    AND?: PlayerStatsWhereInput | PlayerStatsWhereInput[]
    OR?: PlayerStatsWhereInput[]
    NOT?: PlayerStatsWhereInput | PlayerStatsWhereInput[]
    id?: StringFilter<"PlayerStats"> | string
    gameId?: StringFilter<"PlayerStats"> | string
    playerId?: StringFilter<"PlayerStats"> | string
    matchId?: StringNullableFilter<"PlayerStats"> | string | null
    statType?: StringFilter<"PlayerStats"> | string
    period?: StringNullableFilter<"PlayerStats"> | string | null
    statisticsJson?: StringFilter<"PlayerStats"> | string
    createdAt?: DateTimeFilter<"PlayerStats"> | Date | string
    updatedAt?: DateTimeFilter<"PlayerStats"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    player?: XOR<PlayerRelationFilter, PlayerWhereInput>
    match?: XOR<MatchNullableRelationFilter, MatchWhereInput> | null
  }

  export type PlayerStatsOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrder
    playerId?: SortOrder
    matchId?: SortOrderInput | SortOrder
    statType?: SortOrder
    period?: SortOrderInput | SortOrder
    statisticsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
    player?: PlayerOrderByWithRelationInput
    match?: MatchOrderByWithRelationInput
  }

  export type PlayerStatsWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    gameId_playerId_matchId_statType_period?: PlayerStatsGameIdPlayerIdMatchIdStatTypePeriodCompoundUniqueInput
    AND?: PlayerStatsWhereInput | PlayerStatsWhereInput[]
    OR?: PlayerStatsWhereInput[]
    NOT?: PlayerStatsWhereInput | PlayerStatsWhereInput[]
    gameId?: StringFilter<"PlayerStats"> | string
    playerId?: StringFilter<"PlayerStats"> | string
    matchId?: StringNullableFilter<"PlayerStats"> | string | null
    statType?: StringFilter<"PlayerStats"> | string
    period?: StringNullableFilter<"PlayerStats"> | string | null
    statisticsJson?: StringFilter<"PlayerStats"> | string
    createdAt?: DateTimeFilter<"PlayerStats"> | Date | string
    updatedAt?: DateTimeFilter<"PlayerStats"> | Date | string
    game?: XOR<GameRelationFilter, GameWhereInput>
    player?: XOR<PlayerRelationFilter, PlayerWhereInput>
    match?: XOR<MatchNullableRelationFilter, MatchWhereInput> | null
  }, "id" | "gameId_playerId_matchId_statType_period">

  export type PlayerStatsOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrder
    playerId?: SortOrder
    matchId?: SortOrderInput | SortOrder
    statType?: SortOrder
    period?: SortOrderInput | SortOrder
    statisticsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PlayerStatsCountOrderByAggregateInput
    _max?: PlayerStatsMaxOrderByAggregateInput
    _min?: PlayerStatsMinOrderByAggregateInput
  }

  export type PlayerStatsScalarWhereWithAggregatesInput = {
    AND?: PlayerStatsScalarWhereWithAggregatesInput | PlayerStatsScalarWhereWithAggregatesInput[]
    OR?: PlayerStatsScalarWhereWithAggregatesInput[]
    NOT?: PlayerStatsScalarWhereWithAggregatesInput | PlayerStatsScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"PlayerStats"> | string
    gameId?: StringWithAggregatesFilter<"PlayerStats"> | string
    playerId?: StringWithAggregatesFilter<"PlayerStats"> | string
    matchId?: StringNullableWithAggregatesFilter<"PlayerStats"> | string | null
    statType?: StringWithAggregatesFilter<"PlayerStats"> | string
    period?: StringNullableWithAggregatesFilter<"PlayerStats"> | string | null
    statisticsJson?: StringWithAggregatesFilter<"PlayerStats"> | string
    createdAt?: DateTimeWithAggregatesFilter<"PlayerStats"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"PlayerStats"> | Date | string
  }

  export type JobQueueWhereInput = {
    AND?: JobQueueWhereInput | JobQueueWhereInput[]
    OR?: JobQueueWhereInput[]
    NOT?: JobQueueWhereInput | JobQueueWhereInput[]
    id?: StringFilter<"JobQueue"> | string
    gameId?: StringNullableFilter<"JobQueue"> | string | null
    jobType?: StringFilter<"JobQueue"> | string
    status?: StringFilter<"JobQueue"> | string
    priority?: IntFilter<"JobQueue"> | number
    payload?: StringNullableFilter<"JobQueue"> | string | null
    attempts?: IntFilter<"JobQueue"> | number
    maxAttempts?: IntFilter<"JobQueue"> | number
    error?: StringNullableFilter<"JobQueue"> | string | null
    scheduledAt?: DateTimeFilter<"JobQueue"> | Date | string
    startedAt?: DateTimeNullableFilter<"JobQueue"> | Date | string | null
    completedAt?: DateTimeNullableFilter<"JobQueue"> | Date | string | null
    createdAt?: DateTimeFilter<"JobQueue"> | Date | string
    updatedAt?: DateTimeFilter<"JobQueue"> | Date | string
    game?: XOR<GameNullableRelationFilter, GameWhereInput> | null
  }

  export type JobQueueOrderByWithRelationInput = {
    id?: SortOrder
    gameId?: SortOrderInput | SortOrder
    jobType?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    payload?: SortOrderInput | SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    error?: SortOrderInput | SortOrder
    scheduledAt?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    completedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    game?: GameOrderByWithRelationInput
  }

  export type JobQueueWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: JobQueueWhereInput | JobQueueWhereInput[]
    OR?: JobQueueWhereInput[]
    NOT?: JobQueueWhereInput | JobQueueWhereInput[]
    gameId?: StringNullableFilter<"JobQueue"> | string | null
    jobType?: StringFilter<"JobQueue"> | string
    status?: StringFilter<"JobQueue"> | string
    priority?: IntFilter<"JobQueue"> | number
    payload?: StringNullableFilter<"JobQueue"> | string | null
    attempts?: IntFilter<"JobQueue"> | number
    maxAttempts?: IntFilter<"JobQueue"> | number
    error?: StringNullableFilter<"JobQueue"> | string | null
    scheduledAt?: DateTimeFilter<"JobQueue"> | Date | string
    startedAt?: DateTimeNullableFilter<"JobQueue"> | Date | string | null
    completedAt?: DateTimeNullableFilter<"JobQueue"> | Date | string | null
    createdAt?: DateTimeFilter<"JobQueue"> | Date | string
    updatedAt?: DateTimeFilter<"JobQueue"> | Date | string
    game?: XOR<GameNullableRelationFilter, GameWhereInput> | null
  }, "id">

  export type JobQueueOrderByWithAggregationInput = {
    id?: SortOrder
    gameId?: SortOrderInput | SortOrder
    jobType?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    payload?: SortOrderInput | SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    error?: SortOrderInput | SortOrder
    scheduledAt?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    completedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: JobQueueCountOrderByAggregateInput
    _avg?: JobQueueAvgOrderByAggregateInput
    _max?: JobQueueMaxOrderByAggregateInput
    _min?: JobQueueMinOrderByAggregateInput
    _sum?: JobQueueSumOrderByAggregateInput
  }

  export type JobQueueScalarWhereWithAggregatesInput = {
    AND?: JobQueueScalarWhereWithAggregatesInput | JobQueueScalarWhereWithAggregatesInput[]
    OR?: JobQueueScalarWhereWithAggregatesInput[]
    NOT?: JobQueueScalarWhereWithAggregatesInput | JobQueueScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"JobQueue"> | string
    gameId?: StringNullableWithAggregatesFilter<"JobQueue"> | string | null
    jobType?: StringWithAggregatesFilter<"JobQueue"> | string
    status?: StringWithAggregatesFilter<"JobQueue"> | string
    priority?: IntWithAggregatesFilter<"JobQueue"> | number
    payload?: StringNullableWithAggregatesFilter<"JobQueue"> | string | null
    attempts?: IntWithAggregatesFilter<"JobQueue"> | number
    maxAttempts?: IntWithAggregatesFilter<"JobQueue"> | number
    error?: StringNullableWithAggregatesFilter<"JobQueue"> | string | null
    scheduledAt?: DateTimeWithAggregatesFilter<"JobQueue"> | Date | string
    startedAt?: DateTimeNullableWithAggregatesFilter<"JobQueue"> | Date | string | null
    completedAt?: DateTimeNullableWithAggregatesFilter<"JobQueue"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"JobQueue"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"JobQueue"> | Date | string
  }

  export type GameCreateInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    matches?: MatchCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    matches?: MatchUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type GameCreateManyInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GameUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerCreateInput = {
    id?: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutPlayersInput
    playerStats?: PlayerStatsCreateNestedManyWithoutPlayerInput
    matchResults?: MatchResultCreateNestedManyWithoutPlayerInput
  }

  export type PlayerUncheckedCreateInput = {
    id?: string
    gameId: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutPlayerInput
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutPlayerInput
  }

  export type PlayerUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutPlayersNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutPlayerNestedInput
    matchResults?: MatchResultUpdateManyWithoutPlayerNestedInput
  }

  export type PlayerUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutPlayerNestedInput
    matchResults?: MatchResultUncheckedUpdateManyWithoutPlayerNestedInput
  }

  export type PlayerCreateManyInput = {
    id?: string
    gameId: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CharacterCreateInput = {
    id?: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutCharactersInput
    matchResults?: MatchResultCreateNestedManyWithoutCharacterInput
  }

  export type CharacterUncheckedCreateInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutCharacterInput
  }

  export type CharacterUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutCharactersNestedInput
    matchResults?: MatchResultUpdateManyWithoutCharacterNestedInput
  }

  export type CharacterUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutCharacterNestedInput
  }

  export type CharacterCreateManyInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CharacterUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CharacterUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MapCreateInput = {
    id?: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMapsInput
    matches?: MatchCreateNestedManyWithoutMapInput
  }

  export type MapUncheckedCreateInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchUncheckedCreateNestedManyWithoutMapInput
  }

  export type MapUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMapsNestedInput
    matches?: MatchUpdateManyWithoutMapNestedInput
  }

  export type MapUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUncheckedUpdateManyWithoutMapNestedInput
  }

  export type MapCreateManyInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MapUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MapUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameModeCreateInput = {
    id?: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutGameModesInput
    matches?: MatchCreateNestedManyWithoutGameModeInput
  }

  export type GameModeUncheckedCreateInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchUncheckedCreateNestedManyWithoutGameModeInput
  }

  export type GameModeUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutGameModesNestedInput
    matches?: MatchUpdateManyWithoutGameModeNestedInput
  }

  export type GameModeUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUncheckedUpdateManyWithoutGameModeNestedInput
  }

  export type GameModeCreateManyInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GameModeUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameModeUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchCreateInput = {
    id?: string
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMatchesInput
    map?: MapCreateNestedOneWithoutMatchesInput
    gameMode?: GameModeCreateNestedOneWithoutMatchesInput
    matchResults?: MatchResultCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsCreateNestedManyWithoutMatchInput
  }

  export type MatchUncheckedCreateInput = {
    id?: string
    gameId: string
    mapId?: string | null
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutMatchInput
  }

  export type MatchUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMatchesNestedInput
    map?: MapUpdateOneWithoutMatchesNestedInput
    gameMode?: GameModeUpdateOneWithoutMatchesNestedInput
    matchResults?: MatchResultUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutMatchNestedInput
  }

  export type MatchCreateManyInput = {
    id?: string
    gameId: string
    mapId?: string | null
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultCreateInput = {
    id?: string
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    match: MatchCreateNestedOneWithoutMatchResultsInput
    player: PlayerCreateNestedOneWithoutMatchResultsInput
    character?: CharacterCreateNestedOneWithoutMatchResultsInput
  }

  export type MatchResultUncheckedCreateInput = {
    id?: string
    matchId: string
    playerId: string
    characterId?: string | null
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    match?: MatchUpdateOneRequiredWithoutMatchResultsNestedInput
    player?: PlayerUpdateOneRequiredWithoutMatchResultsNestedInput
    character?: CharacterUpdateOneWithoutMatchResultsNestedInput
  }

  export type MatchResultUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    characterId?: NullableStringFieldUpdateOperationsInput | string | null
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultCreateManyInput = {
    id?: string
    matchId: string
    playerId: string
    characterId?: string | null
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    characterId?: NullableStringFieldUpdateOperationsInput | string | null
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsCreateInput = {
    id?: string
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutPlayerStatsInput
    player: PlayerCreateNestedOneWithoutPlayerStatsInput
    match?: MatchCreateNestedOneWithoutPlayerStatsInput
  }

  export type PlayerStatsUncheckedCreateInput = {
    id?: string
    gameId: string
    playerId: string
    matchId?: string | null
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutPlayerStatsNestedInput
    player?: PlayerUpdateOneRequiredWithoutPlayerStatsNestedInput
    match?: MatchUpdateOneWithoutPlayerStatsNestedInput
  }

  export type PlayerStatsUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    matchId?: NullableStringFieldUpdateOperationsInput | string | null
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsCreateManyInput = {
    id?: string
    gameId: string
    playerId: string
    matchId?: string | null
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    matchId?: NullableStringFieldUpdateOperationsInput | string | null
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type JobQueueCreateInput = {
    id?: string
    jobType: string
    status?: string
    priority?: number
    payload?: string | null
    attempts?: number
    maxAttempts?: number
    error?: string | null
    scheduledAt?: Date | string
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    game?: GameCreateNestedOneWithoutJobQueueInput
  }

  export type JobQueueUncheckedCreateInput = {
    id?: string
    gameId?: string | null
    jobType: string
    status?: string
    priority?: number
    payload?: string | null
    attempts?: number
    maxAttempts?: number
    error?: string | null
    scheduledAt?: Date | string
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type JobQueueUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneWithoutJobQueueNestedInput
  }

  export type JobQueueUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: NullableStringFieldUpdateOperationsInput | string | null
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type JobQueueCreateManyInput = {
    id?: string
    gameId?: string | null
    jobType: string
    status?: string
    priority?: number
    payload?: string | null
    attempts?: number
    maxAttempts?: number
    error?: string | null
    scheduledAt?: Date | string
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type JobQueueUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type JobQueueUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: NullableStringFieldUpdateOperationsInput | string | null
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type PlayerListRelationFilter = {
    every?: PlayerWhereInput
    some?: PlayerWhereInput
    none?: PlayerWhereInput
  }

  export type MatchListRelationFilter = {
    every?: MatchWhereInput
    some?: MatchWhereInput
    none?: MatchWhereInput
  }

  export type CharacterListRelationFilter = {
    every?: CharacterWhereInput
    some?: CharacterWhereInput
    none?: CharacterWhereInput
  }

  export type MapListRelationFilter = {
    every?: MapWhereInput
    some?: MapWhereInput
    none?: MapWhereInput
  }

  export type GameModeListRelationFilter = {
    every?: GameModeWhereInput
    some?: GameModeWhereInput
    none?: GameModeWhereInput
  }

  export type PlayerStatsListRelationFilter = {
    every?: PlayerStatsWhereInput
    some?: PlayerStatsWhereInput
    none?: PlayerStatsWhereInput
  }

  export type JobQueueListRelationFilter = {
    every?: JobQueueWhereInput
    some?: JobQueueWhereInput
    none?: JobQueueWhereInput
  }

  export type PlayerOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type MatchOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CharacterOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type MapOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type GameModeOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PlayerStatsOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type JobQueueOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type GameCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type GameRelationFilter = {
    is?: GameWhereInput
    isNot?: GameWhereInput
  }

  export type MatchResultListRelationFilter = {
    every?: MatchResultWhereInput
    some?: MatchResultWhereInput
    none?: MatchResultWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type MatchResultOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PlayerGameIdUsernameCompoundUniqueInput = {
    gameId: string
    username: string
  }

  export type PlayerCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    username?: SortOrder
    displayName?: SortOrder
    userId?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PlayerMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    username?: SortOrder
    displayName?: SortOrder
    userId?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PlayerMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    username?: SortOrder
    displayName?: SortOrder
    userId?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type CharacterGameIdNameCompoundUniqueInput = {
    gameId: string
    name: string
  }

  export type CharacterCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    role?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CharacterMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    role?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CharacterMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    role?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MapGameIdNameCompoundUniqueInput = {
    gameId: string
    name: string
  }

  export type MapCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    mapType?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MapMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    mapType?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MapMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    mapType?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameModeGameIdNameCompoundUniqueInput = {
    gameId: string
    name: string
  }

  export type GameModeCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameModeMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameModeMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    name?: SortOrder
    displayName?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type MapNullableRelationFilter = {
    is?: MapWhereInput | null
    isNot?: MapWhereInput | null
  }

  export type GameModeNullableRelationFilter = {
    is?: GameModeWhereInput | null
    isNot?: GameModeWhereInput | null
  }

  export type MatchCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    mapId?: SortOrder
    gameModeId?: SortOrder
    matchCode?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MatchMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    mapId?: SortOrder
    gameModeId?: SortOrder
    matchCode?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MatchMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    mapId?: SortOrder
    gameModeId?: SortOrder
    matchCode?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type MatchRelationFilter = {
    is?: MatchWhereInput
    isNot?: MatchWhereInput
  }

  export type PlayerRelationFilter = {
    is?: PlayerWhereInput
    isNot?: PlayerWhereInput
  }

  export type CharacterNullableRelationFilter = {
    is?: CharacterWhereInput | null
    isNot?: CharacterWhereInput | null
  }

  export type MatchResultMatchIdPlayerIdCompoundUniqueInput = {
    matchId: string
    playerId: string
  }

  export type MatchResultCountOrderByAggregateInput = {
    id?: SortOrder
    matchId?: SortOrder
    playerId?: SortOrder
    characterId?: SortOrder
    team?: SortOrder
    result?: SortOrder
    score?: SortOrder
    placement?: SortOrder
    statsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MatchResultAvgOrderByAggregateInput = {
    score?: SortOrder
    placement?: SortOrder
  }

  export type MatchResultMaxOrderByAggregateInput = {
    id?: SortOrder
    matchId?: SortOrder
    playerId?: SortOrder
    characterId?: SortOrder
    team?: SortOrder
    result?: SortOrder
    score?: SortOrder
    placement?: SortOrder
    statsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MatchResultMinOrderByAggregateInput = {
    id?: SortOrder
    matchId?: SortOrder
    playerId?: SortOrder
    characterId?: SortOrder
    team?: SortOrder
    result?: SortOrder
    score?: SortOrder
    placement?: SortOrder
    statsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MatchResultSumOrderByAggregateInput = {
    score?: SortOrder
    placement?: SortOrder
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type MatchNullableRelationFilter = {
    is?: MatchWhereInput | null
    isNot?: MatchWhereInput | null
  }

  export type PlayerStatsGameIdPlayerIdMatchIdStatTypePeriodCompoundUniqueInput = {
    gameId: string
    playerId: string
    matchId: string
    statType: string
    period: string
  }

  export type PlayerStatsCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    playerId?: SortOrder
    matchId?: SortOrder
    statType?: SortOrder
    period?: SortOrder
    statisticsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PlayerStatsMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    playerId?: SortOrder
    matchId?: SortOrder
    statType?: SortOrder
    period?: SortOrder
    statisticsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PlayerStatsMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    playerId?: SortOrder
    matchId?: SortOrder
    statType?: SortOrder
    period?: SortOrder
    statisticsJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type GameNullableRelationFilter = {
    is?: GameWhereInput | null
    isNot?: GameWhereInput | null
  }

  export type JobQueueCountOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    jobType?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    payload?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    error?: SortOrder
    scheduledAt?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type JobQueueAvgOrderByAggregateInput = {
    priority?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
  }

  export type JobQueueMaxOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    jobType?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    payload?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    error?: SortOrder
    scheduledAt?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type JobQueueMinOrderByAggregateInput = {
    id?: SortOrder
    gameId?: SortOrder
    jobType?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    payload?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
    error?: SortOrder
    scheduledAt?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type JobQueueSumOrderByAggregateInput = {
    priority?: SortOrder
    attempts?: SortOrder
    maxAttempts?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type PlayerCreateNestedManyWithoutGameInput = {
    create?: XOR<PlayerCreateWithoutGameInput, PlayerUncheckedCreateWithoutGameInput> | PlayerCreateWithoutGameInput[] | PlayerUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerCreateOrConnectWithoutGameInput | PlayerCreateOrConnectWithoutGameInput[]
    createMany?: PlayerCreateManyGameInputEnvelope
    connect?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
  }

  export type MatchCreateNestedManyWithoutGameInput = {
    create?: XOR<MatchCreateWithoutGameInput, MatchUncheckedCreateWithoutGameInput> | MatchCreateWithoutGameInput[] | MatchUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameInput | MatchCreateOrConnectWithoutGameInput[]
    createMany?: MatchCreateManyGameInputEnvelope
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
  }

  export type CharacterCreateNestedManyWithoutGameInput = {
    create?: XOR<CharacterCreateWithoutGameInput, CharacterUncheckedCreateWithoutGameInput> | CharacterCreateWithoutGameInput[] | CharacterUncheckedCreateWithoutGameInput[]
    connectOrCreate?: CharacterCreateOrConnectWithoutGameInput | CharacterCreateOrConnectWithoutGameInput[]
    createMany?: CharacterCreateManyGameInputEnvelope
    connect?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
  }

  export type MapCreateNestedManyWithoutGameInput = {
    create?: XOR<MapCreateWithoutGameInput, MapUncheckedCreateWithoutGameInput> | MapCreateWithoutGameInput[] | MapUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MapCreateOrConnectWithoutGameInput | MapCreateOrConnectWithoutGameInput[]
    createMany?: MapCreateManyGameInputEnvelope
    connect?: MapWhereUniqueInput | MapWhereUniqueInput[]
  }

  export type GameModeCreateNestedManyWithoutGameInput = {
    create?: XOR<GameModeCreateWithoutGameInput, GameModeUncheckedCreateWithoutGameInput> | GameModeCreateWithoutGameInput[] | GameModeUncheckedCreateWithoutGameInput[]
    connectOrCreate?: GameModeCreateOrConnectWithoutGameInput | GameModeCreateOrConnectWithoutGameInput[]
    createMany?: GameModeCreateManyGameInputEnvelope
    connect?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
  }

  export type PlayerStatsCreateNestedManyWithoutGameInput = {
    create?: XOR<PlayerStatsCreateWithoutGameInput, PlayerStatsUncheckedCreateWithoutGameInput> | PlayerStatsCreateWithoutGameInput[] | PlayerStatsUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutGameInput | PlayerStatsCreateOrConnectWithoutGameInput[]
    createMany?: PlayerStatsCreateManyGameInputEnvelope
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
  }

  export type JobQueueCreateNestedManyWithoutGameInput = {
    create?: XOR<JobQueueCreateWithoutGameInput, JobQueueUncheckedCreateWithoutGameInput> | JobQueueCreateWithoutGameInput[] | JobQueueUncheckedCreateWithoutGameInput[]
    connectOrCreate?: JobQueueCreateOrConnectWithoutGameInput | JobQueueCreateOrConnectWithoutGameInput[]
    createMany?: JobQueueCreateManyGameInputEnvelope
    connect?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
  }

  export type PlayerUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<PlayerCreateWithoutGameInput, PlayerUncheckedCreateWithoutGameInput> | PlayerCreateWithoutGameInput[] | PlayerUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerCreateOrConnectWithoutGameInput | PlayerCreateOrConnectWithoutGameInput[]
    createMany?: PlayerCreateManyGameInputEnvelope
    connect?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
  }

  export type MatchUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<MatchCreateWithoutGameInput, MatchUncheckedCreateWithoutGameInput> | MatchCreateWithoutGameInput[] | MatchUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameInput | MatchCreateOrConnectWithoutGameInput[]
    createMany?: MatchCreateManyGameInputEnvelope
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
  }

  export type CharacterUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<CharacterCreateWithoutGameInput, CharacterUncheckedCreateWithoutGameInput> | CharacterCreateWithoutGameInput[] | CharacterUncheckedCreateWithoutGameInput[]
    connectOrCreate?: CharacterCreateOrConnectWithoutGameInput | CharacterCreateOrConnectWithoutGameInput[]
    createMany?: CharacterCreateManyGameInputEnvelope
    connect?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
  }

  export type MapUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<MapCreateWithoutGameInput, MapUncheckedCreateWithoutGameInput> | MapCreateWithoutGameInput[] | MapUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MapCreateOrConnectWithoutGameInput | MapCreateOrConnectWithoutGameInput[]
    createMany?: MapCreateManyGameInputEnvelope
    connect?: MapWhereUniqueInput | MapWhereUniqueInput[]
  }

  export type GameModeUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<GameModeCreateWithoutGameInput, GameModeUncheckedCreateWithoutGameInput> | GameModeCreateWithoutGameInput[] | GameModeUncheckedCreateWithoutGameInput[]
    connectOrCreate?: GameModeCreateOrConnectWithoutGameInput | GameModeCreateOrConnectWithoutGameInput[]
    createMany?: GameModeCreateManyGameInputEnvelope
    connect?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
  }

  export type PlayerStatsUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<PlayerStatsCreateWithoutGameInput, PlayerStatsUncheckedCreateWithoutGameInput> | PlayerStatsCreateWithoutGameInput[] | PlayerStatsUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutGameInput | PlayerStatsCreateOrConnectWithoutGameInput[]
    createMany?: PlayerStatsCreateManyGameInputEnvelope
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
  }

  export type JobQueueUncheckedCreateNestedManyWithoutGameInput = {
    create?: XOR<JobQueueCreateWithoutGameInput, JobQueueUncheckedCreateWithoutGameInput> | JobQueueCreateWithoutGameInput[] | JobQueueUncheckedCreateWithoutGameInput[]
    connectOrCreate?: JobQueueCreateOrConnectWithoutGameInput | JobQueueCreateOrConnectWithoutGameInput[]
    createMany?: JobQueueCreateManyGameInputEnvelope
    connect?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type PlayerUpdateManyWithoutGameNestedInput = {
    create?: XOR<PlayerCreateWithoutGameInput, PlayerUncheckedCreateWithoutGameInput> | PlayerCreateWithoutGameInput[] | PlayerUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerCreateOrConnectWithoutGameInput | PlayerCreateOrConnectWithoutGameInput[]
    upsert?: PlayerUpsertWithWhereUniqueWithoutGameInput | PlayerUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: PlayerCreateManyGameInputEnvelope
    set?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    disconnect?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    delete?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    connect?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    update?: PlayerUpdateWithWhereUniqueWithoutGameInput | PlayerUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: PlayerUpdateManyWithWhereWithoutGameInput | PlayerUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: PlayerScalarWhereInput | PlayerScalarWhereInput[]
  }

  export type MatchUpdateManyWithoutGameNestedInput = {
    create?: XOR<MatchCreateWithoutGameInput, MatchUncheckedCreateWithoutGameInput> | MatchCreateWithoutGameInput[] | MatchUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameInput | MatchCreateOrConnectWithoutGameInput[]
    upsert?: MatchUpsertWithWhereUniqueWithoutGameInput | MatchUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: MatchCreateManyGameInputEnvelope
    set?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    disconnect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    delete?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    update?: MatchUpdateWithWhereUniqueWithoutGameInput | MatchUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: MatchUpdateManyWithWhereWithoutGameInput | MatchUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: MatchScalarWhereInput | MatchScalarWhereInput[]
  }

  export type CharacterUpdateManyWithoutGameNestedInput = {
    create?: XOR<CharacterCreateWithoutGameInput, CharacterUncheckedCreateWithoutGameInput> | CharacterCreateWithoutGameInput[] | CharacterUncheckedCreateWithoutGameInput[]
    connectOrCreate?: CharacterCreateOrConnectWithoutGameInput | CharacterCreateOrConnectWithoutGameInput[]
    upsert?: CharacterUpsertWithWhereUniqueWithoutGameInput | CharacterUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: CharacterCreateManyGameInputEnvelope
    set?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    disconnect?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    delete?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    connect?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    update?: CharacterUpdateWithWhereUniqueWithoutGameInput | CharacterUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: CharacterUpdateManyWithWhereWithoutGameInput | CharacterUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: CharacterScalarWhereInput | CharacterScalarWhereInput[]
  }

  export type MapUpdateManyWithoutGameNestedInput = {
    create?: XOR<MapCreateWithoutGameInput, MapUncheckedCreateWithoutGameInput> | MapCreateWithoutGameInput[] | MapUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MapCreateOrConnectWithoutGameInput | MapCreateOrConnectWithoutGameInput[]
    upsert?: MapUpsertWithWhereUniqueWithoutGameInput | MapUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: MapCreateManyGameInputEnvelope
    set?: MapWhereUniqueInput | MapWhereUniqueInput[]
    disconnect?: MapWhereUniqueInput | MapWhereUniqueInput[]
    delete?: MapWhereUniqueInput | MapWhereUniqueInput[]
    connect?: MapWhereUniqueInput | MapWhereUniqueInput[]
    update?: MapUpdateWithWhereUniqueWithoutGameInput | MapUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: MapUpdateManyWithWhereWithoutGameInput | MapUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: MapScalarWhereInput | MapScalarWhereInput[]
  }

  export type GameModeUpdateManyWithoutGameNestedInput = {
    create?: XOR<GameModeCreateWithoutGameInput, GameModeUncheckedCreateWithoutGameInput> | GameModeCreateWithoutGameInput[] | GameModeUncheckedCreateWithoutGameInput[]
    connectOrCreate?: GameModeCreateOrConnectWithoutGameInput | GameModeCreateOrConnectWithoutGameInput[]
    upsert?: GameModeUpsertWithWhereUniqueWithoutGameInput | GameModeUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: GameModeCreateManyGameInputEnvelope
    set?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    disconnect?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    delete?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    connect?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    update?: GameModeUpdateWithWhereUniqueWithoutGameInput | GameModeUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: GameModeUpdateManyWithWhereWithoutGameInput | GameModeUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: GameModeScalarWhereInput | GameModeScalarWhereInput[]
  }

  export type PlayerStatsUpdateManyWithoutGameNestedInput = {
    create?: XOR<PlayerStatsCreateWithoutGameInput, PlayerStatsUncheckedCreateWithoutGameInput> | PlayerStatsCreateWithoutGameInput[] | PlayerStatsUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutGameInput | PlayerStatsCreateOrConnectWithoutGameInput[]
    upsert?: PlayerStatsUpsertWithWhereUniqueWithoutGameInput | PlayerStatsUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: PlayerStatsCreateManyGameInputEnvelope
    set?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    disconnect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    delete?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    update?: PlayerStatsUpdateWithWhereUniqueWithoutGameInput | PlayerStatsUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: PlayerStatsUpdateManyWithWhereWithoutGameInput | PlayerStatsUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
  }

  export type JobQueueUpdateManyWithoutGameNestedInput = {
    create?: XOR<JobQueueCreateWithoutGameInput, JobQueueUncheckedCreateWithoutGameInput> | JobQueueCreateWithoutGameInput[] | JobQueueUncheckedCreateWithoutGameInput[]
    connectOrCreate?: JobQueueCreateOrConnectWithoutGameInput | JobQueueCreateOrConnectWithoutGameInput[]
    upsert?: JobQueueUpsertWithWhereUniqueWithoutGameInput | JobQueueUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: JobQueueCreateManyGameInputEnvelope
    set?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    disconnect?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    delete?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    connect?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    update?: JobQueueUpdateWithWhereUniqueWithoutGameInput | JobQueueUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: JobQueueUpdateManyWithWhereWithoutGameInput | JobQueueUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: JobQueueScalarWhereInput | JobQueueScalarWhereInput[]
  }

  export type PlayerUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<PlayerCreateWithoutGameInput, PlayerUncheckedCreateWithoutGameInput> | PlayerCreateWithoutGameInput[] | PlayerUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerCreateOrConnectWithoutGameInput | PlayerCreateOrConnectWithoutGameInput[]
    upsert?: PlayerUpsertWithWhereUniqueWithoutGameInput | PlayerUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: PlayerCreateManyGameInputEnvelope
    set?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    disconnect?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    delete?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    connect?: PlayerWhereUniqueInput | PlayerWhereUniqueInput[]
    update?: PlayerUpdateWithWhereUniqueWithoutGameInput | PlayerUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: PlayerUpdateManyWithWhereWithoutGameInput | PlayerUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: PlayerScalarWhereInput | PlayerScalarWhereInput[]
  }

  export type MatchUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<MatchCreateWithoutGameInput, MatchUncheckedCreateWithoutGameInput> | MatchCreateWithoutGameInput[] | MatchUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameInput | MatchCreateOrConnectWithoutGameInput[]
    upsert?: MatchUpsertWithWhereUniqueWithoutGameInput | MatchUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: MatchCreateManyGameInputEnvelope
    set?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    disconnect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    delete?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    update?: MatchUpdateWithWhereUniqueWithoutGameInput | MatchUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: MatchUpdateManyWithWhereWithoutGameInput | MatchUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: MatchScalarWhereInput | MatchScalarWhereInput[]
  }

  export type CharacterUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<CharacterCreateWithoutGameInput, CharacterUncheckedCreateWithoutGameInput> | CharacterCreateWithoutGameInput[] | CharacterUncheckedCreateWithoutGameInput[]
    connectOrCreate?: CharacterCreateOrConnectWithoutGameInput | CharacterCreateOrConnectWithoutGameInput[]
    upsert?: CharacterUpsertWithWhereUniqueWithoutGameInput | CharacterUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: CharacterCreateManyGameInputEnvelope
    set?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    disconnect?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    delete?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    connect?: CharacterWhereUniqueInput | CharacterWhereUniqueInput[]
    update?: CharacterUpdateWithWhereUniqueWithoutGameInput | CharacterUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: CharacterUpdateManyWithWhereWithoutGameInput | CharacterUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: CharacterScalarWhereInput | CharacterScalarWhereInput[]
  }

  export type MapUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<MapCreateWithoutGameInput, MapUncheckedCreateWithoutGameInput> | MapCreateWithoutGameInput[] | MapUncheckedCreateWithoutGameInput[]
    connectOrCreate?: MapCreateOrConnectWithoutGameInput | MapCreateOrConnectWithoutGameInput[]
    upsert?: MapUpsertWithWhereUniqueWithoutGameInput | MapUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: MapCreateManyGameInputEnvelope
    set?: MapWhereUniqueInput | MapWhereUniqueInput[]
    disconnect?: MapWhereUniqueInput | MapWhereUniqueInput[]
    delete?: MapWhereUniqueInput | MapWhereUniqueInput[]
    connect?: MapWhereUniqueInput | MapWhereUniqueInput[]
    update?: MapUpdateWithWhereUniqueWithoutGameInput | MapUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: MapUpdateManyWithWhereWithoutGameInput | MapUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: MapScalarWhereInput | MapScalarWhereInput[]
  }

  export type GameModeUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<GameModeCreateWithoutGameInput, GameModeUncheckedCreateWithoutGameInput> | GameModeCreateWithoutGameInput[] | GameModeUncheckedCreateWithoutGameInput[]
    connectOrCreate?: GameModeCreateOrConnectWithoutGameInput | GameModeCreateOrConnectWithoutGameInput[]
    upsert?: GameModeUpsertWithWhereUniqueWithoutGameInput | GameModeUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: GameModeCreateManyGameInputEnvelope
    set?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    disconnect?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    delete?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    connect?: GameModeWhereUniqueInput | GameModeWhereUniqueInput[]
    update?: GameModeUpdateWithWhereUniqueWithoutGameInput | GameModeUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: GameModeUpdateManyWithWhereWithoutGameInput | GameModeUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: GameModeScalarWhereInput | GameModeScalarWhereInput[]
  }

  export type PlayerStatsUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<PlayerStatsCreateWithoutGameInput, PlayerStatsUncheckedCreateWithoutGameInput> | PlayerStatsCreateWithoutGameInput[] | PlayerStatsUncheckedCreateWithoutGameInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutGameInput | PlayerStatsCreateOrConnectWithoutGameInput[]
    upsert?: PlayerStatsUpsertWithWhereUniqueWithoutGameInput | PlayerStatsUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: PlayerStatsCreateManyGameInputEnvelope
    set?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    disconnect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    delete?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    update?: PlayerStatsUpdateWithWhereUniqueWithoutGameInput | PlayerStatsUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: PlayerStatsUpdateManyWithWhereWithoutGameInput | PlayerStatsUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
  }

  export type JobQueueUncheckedUpdateManyWithoutGameNestedInput = {
    create?: XOR<JobQueueCreateWithoutGameInput, JobQueueUncheckedCreateWithoutGameInput> | JobQueueCreateWithoutGameInput[] | JobQueueUncheckedCreateWithoutGameInput[]
    connectOrCreate?: JobQueueCreateOrConnectWithoutGameInput | JobQueueCreateOrConnectWithoutGameInput[]
    upsert?: JobQueueUpsertWithWhereUniqueWithoutGameInput | JobQueueUpsertWithWhereUniqueWithoutGameInput[]
    createMany?: JobQueueCreateManyGameInputEnvelope
    set?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    disconnect?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    delete?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    connect?: JobQueueWhereUniqueInput | JobQueueWhereUniqueInput[]
    update?: JobQueueUpdateWithWhereUniqueWithoutGameInput | JobQueueUpdateWithWhereUniqueWithoutGameInput[]
    updateMany?: JobQueueUpdateManyWithWhereWithoutGameInput | JobQueueUpdateManyWithWhereWithoutGameInput[]
    deleteMany?: JobQueueScalarWhereInput | JobQueueScalarWhereInput[]
  }

  export type GameCreateNestedOneWithoutPlayersInput = {
    create?: XOR<GameCreateWithoutPlayersInput, GameUncheckedCreateWithoutPlayersInput>
    connectOrCreate?: GameCreateOrConnectWithoutPlayersInput
    connect?: GameWhereUniqueInput
  }

  export type PlayerStatsCreateNestedManyWithoutPlayerInput = {
    create?: XOR<PlayerStatsCreateWithoutPlayerInput, PlayerStatsUncheckedCreateWithoutPlayerInput> | PlayerStatsCreateWithoutPlayerInput[] | PlayerStatsUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutPlayerInput | PlayerStatsCreateOrConnectWithoutPlayerInput[]
    createMany?: PlayerStatsCreateManyPlayerInputEnvelope
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
  }

  export type MatchResultCreateNestedManyWithoutPlayerInput = {
    create?: XOR<MatchResultCreateWithoutPlayerInput, MatchResultUncheckedCreateWithoutPlayerInput> | MatchResultCreateWithoutPlayerInput[] | MatchResultUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutPlayerInput | MatchResultCreateOrConnectWithoutPlayerInput[]
    createMany?: MatchResultCreateManyPlayerInputEnvelope
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
  }

  export type PlayerStatsUncheckedCreateNestedManyWithoutPlayerInput = {
    create?: XOR<PlayerStatsCreateWithoutPlayerInput, PlayerStatsUncheckedCreateWithoutPlayerInput> | PlayerStatsCreateWithoutPlayerInput[] | PlayerStatsUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutPlayerInput | PlayerStatsCreateOrConnectWithoutPlayerInput[]
    createMany?: PlayerStatsCreateManyPlayerInputEnvelope
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
  }

  export type MatchResultUncheckedCreateNestedManyWithoutPlayerInput = {
    create?: XOR<MatchResultCreateWithoutPlayerInput, MatchResultUncheckedCreateWithoutPlayerInput> | MatchResultCreateWithoutPlayerInput[] | MatchResultUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutPlayerInput | MatchResultCreateOrConnectWithoutPlayerInput[]
    createMany?: MatchResultCreateManyPlayerInputEnvelope
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type GameUpdateOneRequiredWithoutPlayersNestedInput = {
    create?: XOR<GameCreateWithoutPlayersInput, GameUncheckedCreateWithoutPlayersInput>
    connectOrCreate?: GameCreateOrConnectWithoutPlayersInput
    upsert?: GameUpsertWithoutPlayersInput
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutPlayersInput, GameUpdateWithoutPlayersInput>, GameUncheckedUpdateWithoutPlayersInput>
  }

  export type PlayerStatsUpdateManyWithoutPlayerNestedInput = {
    create?: XOR<PlayerStatsCreateWithoutPlayerInput, PlayerStatsUncheckedCreateWithoutPlayerInput> | PlayerStatsCreateWithoutPlayerInput[] | PlayerStatsUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutPlayerInput | PlayerStatsCreateOrConnectWithoutPlayerInput[]
    upsert?: PlayerStatsUpsertWithWhereUniqueWithoutPlayerInput | PlayerStatsUpsertWithWhereUniqueWithoutPlayerInput[]
    createMany?: PlayerStatsCreateManyPlayerInputEnvelope
    set?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    disconnect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    delete?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    update?: PlayerStatsUpdateWithWhereUniqueWithoutPlayerInput | PlayerStatsUpdateWithWhereUniqueWithoutPlayerInput[]
    updateMany?: PlayerStatsUpdateManyWithWhereWithoutPlayerInput | PlayerStatsUpdateManyWithWhereWithoutPlayerInput[]
    deleteMany?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
  }

  export type MatchResultUpdateManyWithoutPlayerNestedInput = {
    create?: XOR<MatchResultCreateWithoutPlayerInput, MatchResultUncheckedCreateWithoutPlayerInput> | MatchResultCreateWithoutPlayerInput[] | MatchResultUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutPlayerInput | MatchResultCreateOrConnectWithoutPlayerInput[]
    upsert?: MatchResultUpsertWithWhereUniqueWithoutPlayerInput | MatchResultUpsertWithWhereUniqueWithoutPlayerInput[]
    createMany?: MatchResultCreateManyPlayerInputEnvelope
    set?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    disconnect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    delete?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    update?: MatchResultUpdateWithWhereUniqueWithoutPlayerInput | MatchResultUpdateWithWhereUniqueWithoutPlayerInput[]
    updateMany?: MatchResultUpdateManyWithWhereWithoutPlayerInput | MatchResultUpdateManyWithWhereWithoutPlayerInput[]
    deleteMany?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
  }

  export type PlayerStatsUncheckedUpdateManyWithoutPlayerNestedInput = {
    create?: XOR<PlayerStatsCreateWithoutPlayerInput, PlayerStatsUncheckedCreateWithoutPlayerInput> | PlayerStatsCreateWithoutPlayerInput[] | PlayerStatsUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutPlayerInput | PlayerStatsCreateOrConnectWithoutPlayerInput[]
    upsert?: PlayerStatsUpsertWithWhereUniqueWithoutPlayerInput | PlayerStatsUpsertWithWhereUniqueWithoutPlayerInput[]
    createMany?: PlayerStatsCreateManyPlayerInputEnvelope
    set?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    disconnect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    delete?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    update?: PlayerStatsUpdateWithWhereUniqueWithoutPlayerInput | PlayerStatsUpdateWithWhereUniqueWithoutPlayerInput[]
    updateMany?: PlayerStatsUpdateManyWithWhereWithoutPlayerInput | PlayerStatsUpdateManyWithWhereWithoutPlayerInput[]
    deleteMany?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
  }

  export type MatchResultUncheckedUpdateManyWithoutPlayerNestedInput = {
    create?: XOR<MatchResultCreateWithoutPlayerInput, MatchResultUncheckedCreateWithoutPlayerInput> | MatchResultCreateWithoutPlayerInput[] | MatchResultUncheckedCreateWithoutPlayerInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutPlayerInput | MatchResultCreateOrConnectWithoutPlayerInput[]
    upsert?: MatchResultUpsertWithWhereUniqueWithoutPlayerInput | MatchResultUpsertWithWhereUniqueWithoutPlayerInput[]
    createMany?: MatchResultCreateManyPlayerInputEnvelope
    set?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    disconnect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    delete?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    update?: MatchResultUpdateWithWhereUniqueWithoutPlayerInput | MatchResultUpdateWithWhereUniqueWithoutPlayerInput[]
    updateMany?: MatchResultUpdateManyWithWhereWithoutPlayerInput | MatchResultUpdateManyWithWhereWithoutPlayerInput[]
    deleteMany?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
  }

  export type GameCreateNestedOneWithoutCharactersInput = {
    create?: XOR<GameCreateWithoutCharactersInput, GameUncheckedCreateWithoutCharactersInput>
    connectOrCreate?: GameCreateOrConnectWithoutCharactersInput
    connect?: GameWhereUniqueInput
  }

  export type MatchResultCreateNestedManyWithoutCharacterInput = {
    create?: XOR<MatchResultCreateWithoutCharacterInput, MatchResultUncheckedCreateWithoutCharacterInput> | MatchResultCreateWithoutCharacterInput[] | MatchResultUncheckedCreateWithoutCharacterInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutCharacterInput | MatchResultCreateOrConnectWithoutCharacterInput[]
    createMany?: MatchResultCreateManyCharacterInputEnvelope
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
  }

  export type MatchResultUncheckedCreateNestedManyWithoutCharacterInput = {
    create?: XOR<MatchResultCreateWithoutCharacterInput, MatchResultUncheckedCreateWithoutCharacterInput> | MatchResultCreateWithoutCharacterInput[] | MatchResultUncheckedCreateWithoutCharacterInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutCharacterInput | MatchResultCreateOrConnectWithoutCharacterInput[]
    createMany?: MatchResultCreateManyCharacterInputEnvelope
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
  }

  export type GameUpdateOneRequiredWithoutCharactersNestedInput = {
    create?: XOR<GameCreateWithoutCharactersInput, GameUncheckedCreateWithoutCharactersInput>
    connectOrCreate?: GameCreateOrConnectWithoutCharactersInput
    upsert?: GameUpsertWithoutCharactersInput
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutCharactersInput, GameUpdateWithoutCharactersInput>, GameUncheckedUpdateWithoutCharactersInput>
  }

  export type MatchResultUpdateManyWithoutCharacterNestedInput = {
    create?: XOR<MatchResultCreateWithoutCharacterInput, MatchResultUncheckedCreateWithoutCharacterInput> | MatchResultCreateWithoutCharacterInput[] | MatchResultUncheckedCreateWithoutCharacterInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutCharacterInput | MatchResultCreateOrConnectWithoutCharacterInput[]
    upsert?: MatchResultUpsertWithWhereUniqueWithoutCharacterInput | MatchResultUpsertWithWhereUniqueWithoutCharacterInput[]
    createMany?: MatchResultCreateManyCharacterInputEnvelope
    set?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    disconnect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    delete?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    update?: MatchResultUpdateWithWhereUniqueWithoutCharacterInput | MatchResultUpdateWithWhereUniqueWithoutCharacterInput[]
    updateMany?: MatchResultUpdateManyWithWhereWithoutCharacterInput | MatchResultUpdateManyWithWhereWithoutCharacterInput[]
    deleteMany?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
  }

  export type MatchResultUncheckedUpdateManyWithoutCharacterNestedInput = {
    create?: XOR<MatchResultCreateWithoutCharacterInput, MatchResultUncheckedCreateWithoutCharacterInput> | MatchResultCreateWithoutCharacterInput[] | MatchResultUncheckedCreateWithoutCharacterInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutCharacterInput | MatchResultCreateOrConnectWithoutCharacterInput[]
    upsert?: MatchResultUpsertWithWhereUniqueWithoutCharacterInput | MatchResultUpsertWithWhereUniqueWithoutCharacterInput[]
    createMany?: MatchResultCreateManyCharacterInputEnvelope
    set?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    disconnect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    delete?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    update?: MatchResultUpdateWithWhereUniqueWithoutCharacterInput | MatchResultUpdateWithWhereUniqueWithoutCharacterInput[]
    updateMany?: MatchResultUpdateManyWithWhereWithoutCharacterInput | MatchResultUpdateManyWithWhereWithoutCharacterInput[]
    deleteMany?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
  }

  export type GameCreateNestedOneWithoutMapsInput = {
    create?: XOR<GameCreateWithoutMapsInput, GameUncheckedCreateWithoutMapsInput>
    connectOrCreate?: GameCreateOrConnectWithoutMapsInput
    connect?: GameWhereUniqueInput
  }

  export type MatchCreateNestedManyWithoutMapInput = {
    create?: XOR<MatchCreateWithoutMapInput, MatchUncheckedCreateWithoutMapInput> | MatchCreateWithoutMapInput[] | MatchUncheckedCreateWithoutMapInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutMapInput | MatchCreateOrConnectWithoutMapInput[]
    createMany?: MatchCreateManyMapInputEnvelope
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
  }

  export type MatchUncheckedCreateNestedManyWithoutMapInput = {
    create?: XOR<MatchCreateWithoutMapInput, MatchUncheckedCreateWithoutMapInput> | MatchCreateWithoutMapInput[] | MatchUncheckedCreateWithoutMapInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutMapInput | MatchCreateOrConnectWithoutMapInput[]
    createMany?: MatchCreateManyMapInputEnvelope
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
  }

  export type GameUpdateOneRequiredWithoutMapsNestedInput = {
    create?: XOR<GameCreateWithoutMapsInput, GameUncheckedCreateWithoutMapsInput>
    connectOrCreate?: GameCreateOrConnectWithoutMapsInput
    upsert?: GameUpsertWithoutMapsInput
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutMapsInput, GameUpdateWithoutMapsInput>, GameUncheckedUpdateWithoutMapsInput>
  }

  export type MatchUpdateManyWithoutMapNestedInput = {
    create?: XOR<MatchCreateWithoutMapInput, MatchUncheckedCreateWithoutMapInput> | MatchCreateWithoutMapInput[] | MatchUncheckedCreateWithoutMapInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutMapInput | MatchCreateOrConnectWithoutMapInput[]
    upsert?: MatchUpsertWithWhereUniqueWithoutMapInput | MatchUpsertWithWhereUniqueWithoutMapInput[]
    createMany?: MatchCreateManyMapInputEnvelope
    set?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    disconnect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    delete?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    update?: MatchUpdateWithWhereUniqueWithoutMapInput | MatchUpdateWithWhereUniqueWithoutMapInput[]
    updateMany?: MatchUpdateManyWithWhereWithoutMapInput | MatchUpdateManyWithWhereWithoutMapInput[]
    deleteMany?: MatchScalarWhereInput | MatchScalarWhereInput[]
  }

  export type MatchUncheckedUpdateManyWithoutMapNestedInput = {
    create?: XOR<MatchCreateWithoutMapInput, MatchUncheckedCreateWithoutMapInput> | MatchCreateWithoutMapInput[] | MatchUncheckedCreateWithoutMapInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutMapInput | MatchCreateOrConnectWithoutMapInput[]
    upsert?: MatchUpsertWithWhereUniqueWithoutMapInput | MatchUpsertWithWhereUniqueWithoutMapInput[]
    createMany?: MatchCreateManyMapInputEnvelope
    set?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    disconnect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    delete?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    update?: MatchUpdateWithWhereUniqueWithoutMapInput | MatchUpdateWithWhereUniqueWithoutMapInput[]
    updateMany?: MatchUpdateManyWithWhereWithoutMapInput | MatchUpdateManyWithWhereWithoutMapInput[]
    deleteMany?: MatchScalarWhereInput | MatchScalarWhereInput[]
  }

  export type GameCreateNestedOneWithoutGameModesInput = {
    create?: XOR<GameCreateWithoutGameModesInput, GameUncheckedCreateWithoutGameModesInput>
    connectOrCreate?: GameCreateOrConnectWithoutGameModesInput
    connect?: GameWhereUniqueInput
  }

  export type MatchCreateNestedManyWithoutGameModeInput = {
    create?: XOR<MatchCreateWithoutGameModeInput, MatchUncheckedCreateWithoutGameModeInput> | MatchCreateWithoutGameModeInput[] | MatchUncheckedCreateWithoutGameModeInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameModeInput | MatchCreateOrConnectWithoutGameModeInput[]
    createMany?: MatchCreateManyGameModeInputEnvelope
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
  }

  export type MatchUncheckedCreateNestedManyWithoutGameModeInput = {
    create?: XOR<MatchCreateWithoutGameModeInput, MatchUncheckedCreateWithoutGameModeInput> | MatchCreateWithoutGameModeInput[] | MatchUncheckedCreateWithoutGameModeInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameModeInput | MatchCreateOrConnectWithoutGameModeInput[]
    createMany?: MatchCreateManyGameModeInputEnvelope
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
  }

  export type GameUpdateOneRequiredWithoutGameModesNestedInput = {
    create?: XOR<GameCreateWithoutGameModesInput, GameUncheckedCreateWithoutGameModesInput>
    connectOrCreate?: GameCreateOrConnectWithoutGameModesInput
    upsert?: GameUpsertWithoutGameModesInput
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutGameModesInput, GameUpdateWithoutGameModesInput>, GameUncheckedUpdateWithoutGameModesInput>
  }

  export type MatchUpdateManyWithoutGameModeNestedInput = {
    create?: XOR<MatchCreateWithoutGameModeInput, MatchUncheckedCreateWithoutGameModeInput> | MatchCreateWithoutGameModeInput[] | MatchUncheckedCreateWithoutGameModeInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameModeInput | MatchCreateOrConnectWithoutGameModeInput[]
    upsert?: MatchUpsertWithWhereUniqueWithoutGameModeInput | MatchUpsertWithWhereUniqueWithoutGameModeInput[]
    createMany?: MatchCreateManyGameModeInputEnvelope
    set?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    disconnect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    delete?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    update?: MatchUpdateWithWhereUniqueWithoutGameModeInput | MatchUpdateWithWhereUniqueWithoutGameModeInput[]
    updateMany?: MatchUpdateManyWithWhereWithoutGameModeInput | MatchUpdateManyWithWhereWithoutGameModeInput[]
    deleteMany?: MatchScalarWhereInput | MatchScalarWhereInput[]
  }

  export type MatchUncheckedUpdateManyWithoutGameModeNestedInput = {
    create?: XOR<MatchCreateWithoutGameModeInput, MatchUncheckedCreateWithoutGameModeInput> | MatchCreateWithoutGameModeInput[] | MatchUncheckedCreateWithoutGameModeInput[]
    connectOrCreate?: MatchCreateOrConnectWithoutGameModeInput | MatchCreateOrConnectWithoutGameModeInput[]
    upsert?: MatchUpsertWithWhereUniqueWithoutGameModeInput | MatchUpsertWithWhereUniqueWithoutGameModeInput[]
    createMany?: MatchCreateManyGameModeInputEnvelope
    set?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    disconnect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    delete?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    connect?: MatchWhereUniqueInput | MatchWhereUniqueInput[]
    update?: MatchUpdateWithWhereUniqueWithoutGameModeInput | MatchUpdateWithWhereUniqueWithoutGameModeInput[]
    updateMany?: MatchUpdateManyWithWhereWithoutGameModeInput | MatchUpdateManyWithWhereWithoutGameModeInput[]
    deleteMany?: MatchScalarWhereInput | MatchScalarWhereInput[]
  }

  export type GameCreateNestedOneWithoutMatchesInput = {
    create?: XOR<GameCreateWithoutMatchesInput, GameUncheckedCreateWithoutMatchesInput>
    connectOrCreate?: GameCreateOrConnectWithoutMatchesInput
    connect?: GameWhereUniqueInput
  }

  export type MapCreateNestedOneWithoutMatchesInput = {
    create?: XOR<MapCreateWithoutMatchesInput, MapUncheckedCreateWithoutMatchesInput>
    connectOrCreate?: MapCreateOrConnectWithoutMatchesInput
    connect?: MapWhereUniqueInput
  }

  export type GameModeCreateNestedOneWithoutMatchesInput = {
    create?: XOR<GameModeCreateWithoutMatchesInput, GameModeUncheckedCreateWithoutMatchesInput>
    connectOrCreate?: GameModeCreateOrConnectWithoutMatchesInput
    connect?: GameModeWhereUniqueInput
  }

  export type MatchResultCreateNestedManyWithoutMatchInput = {
    create?: XOR<MatchResultCreateWithoutMatchInput, MatchResultUncheckedCreateWithoutMatchInput> | MatchResultCreateWithoutMatchInput[] | MatchResultUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutMatchInput | MatchResultCreateOrConnectWithoutMatchInput[]
    createMany?: MatchResultCreateManyMatchInputEnvelope
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
  }

  export type PlayerStatsCreateNestedManyWithoutMatchInput = {
    create?: XOR<PlayerStatsCreateWithoutMatchInput, PlayerStatsUncheckedCreateWithoutMatchInput> | PlayerStatsCreateWithoutMatchInput[] | PlayerStatsUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutMatchInput | PlayerStatsCreateOrConnectWithoutMatchInput[]
    createMany?: PlayerStatsCreateManyMatchInputEnvelope
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
  }

  export type MatchResultUncheckedCreateNestedManyWithoutMatchInput = {
    create?: XOR<MatchResultCreateWithoutMatchInput, MatchResultUncheckedCreateWithoutMatchInput> | MatchResultCreateWithoutMatchInput[] | MatchResultUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutMatchInput | MatchResultCreateOrConnectWithoutMatchInput[]
    createMany?: MatchResultCreateManyMatchInputEnvelope
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
  }

  export type PlayerStatsUncheckedCreateNestedManyWithoutMatchInput = {
    create?: XOR<PlayerStatsCreateWithoutMatchInput, PlayerStatsUncheckedCreateWithoutMatchInput> | PlayerStatsCreateWithoutMatchInput[] | PlayerStatsUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutMatchInput | PlayerStatsCreateOrConnectWithoutMatchInput[]
    createMany?: PlayerStatsCreateManyMatchInputEnvelope
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type GameUpdateOneRequiredWithoutMatchesNestedInput = {
    create?: XOR<GameCreateWithoutMatchesInput, GameUncheckedCreateWithoutMatchesInput>
    connectOrCreate?: GameCreateOrConnectWithoutMatchesInput
    upsert?: GameUpsertWithoutMatchesInput
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutMatchesInput, GameUpdateWithoutMatchesInput>, GameUncheckedUpdateWithoutMatchesInput>
  }

  export type MapUpdateOneWithoutMatchesNestedInput = {
    create?: XOR<MapCreateWithoutMatchesInput, MapUncheckedCreateWithoutMatchesInput>
    connectOrCreate?: MapCreateOrConnectWithoutMatchesInput
    upsert?: MapUpsertWithoutMatchesInput
    disconnect?: MapWhereInput | boolean
    delete?: MapWhereInput | boolean
    connect?: MapWhereUniqueInput
    update?: XOR<XOR<MapUpdateToOneWithWhereWithoutMatchesInput, MapUpdateWithoutMatchesInput>, MapUncheckedUpdateWithoutMatchesInput>
  }

  export type GameModeUpdateOneWithoutMatchesNestedInput = {
    create?: XOR<GameModeCreateWithoutMatchesInput, GameModeUncheckedCreateWithoutMatchesInput>
    connectOrCreate?: GameModeCreateOrConnectWithoutMatchesInput
    upsert?: GameModeUpsertWithoutMatchesInput
    disconnect?: GameModeWhereInput | boolean
    delete?: GameModeWhereInput | boolean
    connect?: GameModeWhereUniqueInput
    update?: XOR<XOR<GameModeUpdateToOneWithWhereWithoutMatchesInput, GameModeUpdateWithoutMatchesInput>, GameModeUncheckedUpdateWithoutMatchesInput>
  }

  export type MatchResultUpdateManyWithoutMatchNestedInput = {
    create?: XOR<MatchResultCreateWithoutMatchInput, MatchResultUncheckedCreateWithoutMatchInput> | MatchResultCreateWithoutMatchInput[] | MatchResultUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutMatchInput | MatchResultCreateOrConnectWithoutMatchInput[]
    upsert?: MatchResultUpsertWithWhereUniqueWithoutMatchInput | MatchResultUpsertWithWhereUniqueWithoutMatchInput[]
    createMany?: MatchResultCreateManyMatchInputEnvelope
    set?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    disconnect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    delete?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    update?: MatchResultUpdateWithWhereUniqueWithoutMatchInput | MatchResultUpdateWithWhereUniqueWithoutMatchInput[]
    updateMany?: MatchResultUpdateManyWithWhereWithoutMatchInput | MatchResultUpdateManyWithWhereWithoutMatchInput[]
    deleteMany?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
  }

  export type PlayerStatsUpdateManyWithoutMatchNestedInput = {
    create?: XOR<PlayerStatsCreateWithoutMatchInput, PlayerStatsUncheckedCreateWithoutMatchInput> | PlayerStatsCreateWithoutMatchInput[] | PlayerStatsUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutMatchInput | PlayerStatsCreateOrConnectWithoutMatchInput[]
    upsert?: PlayerStatsUpsertWithWhereUniqueWithoutMatchInput | PlayerStatsUpsertWithWhereUniqueWithoutMatchInput[]
    createMany?: PlayerStatsCreateManyMatchInputEnvelope
    set?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    disconnect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    delete?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    update?: PlayerStatsUpdateWithWhereUniqueWithoutMatchInput | PlayerStatsUpdateWithWhereUniqueWithoutMatchInput[]
    updateMany?: PlayerStatsUpdateManyWithWhereWithoutMatchInput | PlayerStatsUpdateManyWithWhereWithoutMatchInput[]
    deleteMany?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
  }

  export type MatchResultUncheckedUpdateManyWithoutMatchNestedInput = {
    create?: XOR<MatchResultCreateWithoutMatchInput, MatchResultUncheckedCreateWithoutMatchInput> | MatchResultCreateWithoutMatchInput[] | MatchResultUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: MatchResultCreateOrConnectWithoutMatchInput | MatchResultCreateOrConnectWithoutMatchInput[]
    upsert?: MatchResultUpsertWithWhereUniqueWithoutMatchInput | MatchResultUpsertWithWhereUniqueWithoutMatchInput[]
    createMany?: MatchResultCreateManyMatchInputEnvelope
    set?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    disconnect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    delete?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    connect?: MatchResultWhereUniqueInput | MatchResultWhereUniqueInput[]
    update?: MatchResultUpdateWithWhereUniqueWithoutMatchInput | MatchResultUpdateWithWhereUniqueWithoutMatchInput[]
    updateMany?: MatchResultUpdateManyWithWhereWithoutMatchInput | MatchResultUpdateManyWithWhereWithoutMatchInput[]
    deleteMany?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
  }

  export type PlayerStatsUncheckedUpdateManyWithoutMatchNestedInput = {
    create?: XOR<PlayerStatsCreateWithoutMatchInput, PlayerStatsUncheckedCreateWithoutMatchInput> | PlayerStatsCreateWithoutMatchInput[] | PlayerStatsUncheckedCreateWithoutMatchInput[]
    connectOrCreate?: PlayerStatsCreateOrConnectWithoutMatchInput | PlayerStatsCreateOrConnectWithoutMatchInput[]
    upsert?: PlayerStatsUpsertWithWhereUniqueWithoutMatchInput | PlayerStatsUpsertWithWhereUniqueWithoutMatchInput[]
    createMany?: PlayerStatsCreateManyMatchInputEnvelope
    set?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    disconnect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    delete?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    connect?: PlayerStatsWhereUniqueInput | PlayerStatsWhereUniqueInput[]
    update?: PlayerStatsUpdateWithWhereUniqueWithoutMatchInput | PlayerStatsUpdateWithWhereUniqueWithoutMatchInput[]
    updateMany?: PlayerStatsUpdateManyWithWhereWithoutMatchInput | PlayerStatsUpdateManyWithWhereWithoutMatchInput[]
    deleteMany?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
  }

  export type MatchCreateNestedOneWithoutMatchResultsInput = {
    create?: XOR<MatchCreateWithoutMatchResultsInput, MatchUncheckedCreateWithoutMatchResultsInput>
    connectOrCreate?: MatchCreateOrConnectWithoutMatchResultsInput
    connect?: MatchWhereUniqueInput
  }

  export type PlayerCreateNestedOneWithoutMatchResultsInput = {
    create?: XOR<PlayerCreateWithoutMatchResultsInput, PlayerUncheckedCreateWithoutMatchResultsInput>
    connectOrCreate?: PlayerCreateOrConnectWithoutMatchResultsInput
    connect?: PlayerWhereUniqueInput
  }

  export type CharacterCreateNestedOneWithoutMatchResultsInput = {
    create?: XOR<CharacterCreateWithoutMatchResultsInput, CharacterUncheckedCreateWithoutMatchResultsInput>
    connectOrCreate?: CharacterCreateOrConnectWithoutMatchResultsInput
    connect?: CharacterWhereUniqueInput
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type MatchUpdateOneRequiredWithoutMatchResultsNestedInput = {
    create?: XOR<MatchCreateWithoutMatchResultsInput, MatchUncheckedCreateWithoutMatchResultsInput>
    connectOrCreate?: MatchCreateOrConnectWithoutMatchResultsInput
    upsert?: MatchUpsertWithoutMatchResultsInput
    connect?: MatchWhereUniqueInput
    update?: XOR<XOR<MatchUpdateToOneWithWhereWithoutMatchResultsInput, MatchUpdateWithoutMatchResultsInput>, MatchUncheckedUpdateWithoutMatchResultsInput>
  }

  export type PlayerUpdateOneRequiredWithoutMatchResultsNestedInput = {
    create?: XOR<PlayerCreateWithoutMatchResultsInput, PlayerUncheckedCreateWithoutMatchResultsInput>
    connectOrCreate?: PlayerCreateOrConnectWithoutMatchResultsInput
    upsert?: PlayerUpsertWithoutMatchResultsInput
    connect?: PlayerWhereUniqueInput
    update?: XOR<XOR<PlayerUpdateToOneWithWhereWithoutMatchResultsInput, PlayerUpdateWithoutMatchResultsInput>, PlayerUncheckedUpdateWithoutMatchResultsInput>
  }

  export type CharacterUpdateOneWithoutMatchResultsNestedInput = {
    create?: XOR<CharacterCreateWithoutMatchResultsInput, CharacterUncheckedCreateWithoutMatchResultsInput>
    connectOrCreate?: CharacterCreateOrConnectWithoutMatchResultsInput
    upsert?: CharacterUpsertWithoutMatchResultsInput
    disconnect?: CharacterWhereInput | boolean
    delete?: CharacterWhereInput | boolean
    connect?: CharacterWhereUniqueInput
    update?: XOR<XOR<CharacterUpdateToOneWithWhereWithoutMatchResultsInput, CharacterUpdateWithoutMatchResultsInput>, CharacterUncheckedUpdateWithoutMatchResultsInput>
  }

  export type GameCreateNestedOneWithoutPlayerStatsInput = {
    create?: XOR<GameCreateWithoutPlayerStatsInput, GameUncheckedCreateWithoutPlayerStatsInput>
    connectOrCreate?: GameCreateOrConnectWithoutPlayerStatsInput
    connect?: GameWhereUniqueInput
  }

  export type PlayerCreateNestedOneWithoutPlayerStatsInput = {
    create?: XOR<PlayerCreateWithoutPlayerStatsInput, PlayerUncheckedCreateWithoutPlayerStatsInput>
    connectOrCreate?: PlayerCreateOrConnectWithoutPlayerStatsInput
    connect?: PlayerWhereUniqueInput
  }

  export type MatchCreateNestedOneWithoutPlayerStatsInput = {
    create?: XOR<MatchCreateWithoutPlayerStatsInput, MatchUncheckedCreateWithoutPlayerStatsInput>
    connectOrCreate?: MatchCreateOrConnectWithoutPlayerStatsInput
    connect?: MatchWhereUniqueInput
  }

  export type GameUpdateOneRequiredWithoutPlayerStatsNestedInput = {
    create?: XOR<GameCreateWithoutPlayerStatsInput, GameUncheckedCreateWithoutPlayerStatsInput>
    connectOrCreate?: GameCreateOrConnectWithoutPlayerStatsInput
    upsert?: GameUpsertWithoutPlayerStatsInput
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutPlayerStatsInput, GameUpdateWithoutPlayerStatsInput>, GameUncheckedUpdateWithoutPlayerStatsInput>
  }

  export type PlayerUpdateOneRequiredWithoutPlayerStatsNestedInput = {
    create?: XOR<PlayerCreateWithoutPlayerStatsInput, PlayerUncheckedCreateWithoutPlayerStatsInput>
    connectOrCreate?: PlayerCreateOrConnectWithoutPlayerStatsInput
    upsert?: PlayerUpsertWithoutPlayerStatsInput
    connect?: PlayerWhereUniqueInput
    update?: XOR<XOR<PlayerUpdateToOneWithWhereWithoutPlayerStatsInput, PlayerUpdateWithoutPlayerStatsInput>, PlayerUncheckedUpdateWithoutPlayerStatsInput>
  }

  export type MatchUpdateOneWithoutPlayerStatsNestedInput = {
    create?: XOR<MatchCreateWithoutPlayerStatsInput, MatchUncheckedCreateWithoutPlayerStatsInput>
    connectOrCreate?: MatchCreateOrConnectWithoutPlayerStatsInput
    upsert?: MatchUpsertWithoutPlayerStatsInput
    disconnect?: MatchWhereInput | boolean
    delete?: MatchWhereInput | boolean
    connect?: MatchWhereUniqueInput
    update?: XOR<XOR<MatchUpdateToOneWithWhereWithoutPlayerStatsInput, MatchUpdateWithoutPlayerStatsInput>, MatchUncheckedUpdateWithoutPlayerStatsInput>
  }

  export type GameCreateNestedOneWithoutJobQueueInput = {
    create?: XOR<GameCreateWithoutJobQueueInput, GameUncheckedCreateWithoutJobQueueInput>
    connectOrCreate?: GameCreateOrConnectWithoutJobQueueInput
    connect?: GameWhereUniqueInput
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type GameUpdateOneWithoutJobQueueNestedInput = {
    create?: XOR<GameCreateWithoutJobQueueInput, GameUncheckedCreateWithoutJobQueueInput>
    connectOrCreate?: GameCreateOrConnectWithoutJobQueueInput
    upsert?: GameUpsertWithoutJobQueueInput
    disconnect?: GameWhereInput | boolean
    delete?: GameWhereInput | boolean
    connect?: GameWhereUniqueInput
    update?: XOR<XOR<GameUpdateToOneWithWhereWithoutJobQueueInput, GameUpdateWithoutJobQueueInput>, GameUncheckedUpdateWithoutJobQueueInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type PlayerCreateWithoutGameInput = {
    id?: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    playerStats?: PlayerStatsCreateNestedManyWithoutPlayerInput
    matchResults?: MatchResultCreateNestedManyWithoutPlayerInput
  }

  export type PlayerUncheckedCreateWithoutGameInput = {
    id?: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutPlayerInput
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutPlayerInput
  }

  export type PlayerCreateOrConnectWithoutGameInput = {
    where: PlayerWhereUniqueInput
    create: XOR<PlayerCreateWithoutGameInput, PlayerUncheckedCreateWithoutGameInput>
  }

  export type PlayerCreateManyGameInputEnvelope = {
    data: PlayerCreateManyGameInput | PlayerCreateManyGameInput[]
  }

  export type MatchCreateWithoutGameInput = {
    id?: string
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    map?: MapCreateNestedOneWithoutMatchesInput
    gameMode?: GameModeCreateNestedOneWithoutMatchesInput
    matchResults?: MatchResultCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsCreateNestedManyWithoutMatchInput
  }

  export type MatchUncheckedCreateWithoutGameInput = {
    id?: string
    mapId?: string | null
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutMatchInput
  }

  export type MatchCreateOrConnectWithoutGameInput = {
    where: MatchWhereUniqueInput
    create: XOR<MatchCreateWithoutGameInput, MatchUncheckedCreateWithoutGameInput>
  }

  export type MatchCreateManyGameInputEnvelope = {
    data: MatchCreateManyGameInput | MatchCreateManyGameInput[]
  }

  export type CharacterCreateWithoutGameInput = {
    id?: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultCreateNestedManyWithoutCharacterInput
  }

  export type CharacterUncheckedCreateWithoutGameInput = {
    id?: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutCharacterInput
  }

  export type CharacterCreateOrConnectWithoutGameInput = {
    where: CharacterWhereUniqueInput
    create: XOR<CharacterCreateWithoutGameInput, CharacterUncheckedCreateWithoutGameInput>
  }

  export type CharacterCreateManyGameInputEnvelope = {
    data: CharacterCreateManyGameInput | CharacterCreateManyGameInput[]
  }

  export type MapCreateWithoutGameInput = {
    id?: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchCreateNestedManyWithoutMapInput
  }

  export type MapUncheckedCreateWithoutGameInput = {
    id?: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchUncheckedCreateNestedManyWithoutMapInput
  }

  export type MapCreateOrConnectWithoutGameInput = {
    where: MapWhereUniqueInput
    create: XOR<MapCreateWithoutGameInput, MapUncheckedCreateWithoutGameInput>
  }

  export type MapCreateManyGameInputEnvelope = {
    data: MapCreateManyGameInput | MapCreateManyGameInput[]
  }

  export type GameModeCreateWithoutGameInput = {
    id?: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchCreateNestedManyWithoutGameModeInput
  }

  export type GameModeUncheckedCreateWithoutGameInput = {
    id?: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchUncheckedCreateNestedManyWithoutGameModeInput
  }

  export type GameModeCreateOrConnectWithoutGameInput = {
    where: GameModeWhereUniqueInput
    create: XOR<GameModeCreateWithoutGameInput, GameModeUncheckedCreateWithoutGameInput>
  }

  export type GameModeCreateManyGameInputEnvelope = {
    data: GameModeCreateManyGameInput | GameModeCreateManyGameInput[]
  }

  export type PlayerStatsCreateWithoutGameInput = {
    id?: string
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
    player: PlayerCreateNestedOneWithoutPlayerStatsInput
    match?: MatchCreateNestedOneWithoutPlayerStatsInput
  }

  export type PlayerStatsUncheckedCreateWithoutGameInput = {
    id?: string
    playerId: string
    matchId?: string | null
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsCreateOrConnectWithoutGameInput = {
    where: PlayerStatsWhereUniqueInput
    create: XOR<PlayerStatsCreateWithoutGameInput, PlayerStatsUncheckedCreateWithoutGameInput>
  }

  export type PlayerStatsCreateManyGameInputEnvelope = {
    data: PlayerStatsCreateManyGameInput | PlayerStatsCreateManyGameInput[]
  }

  export type JobQueueCreateWithoutGameInput = {
    id?: string
    jobType: string
    status?: string
    priority?: number
    payload?: string | null
    attempts?: number
    maxAttempts?: number
    error?: string | null
    scheduledAt?: Date | string
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type JobQueueUncheckedCreateWithoutGameInput = {
    id?: string
    jobType: string
    status?: string
    priority?: number
    payload?: string | null
    attempts?: number
    maxAttempts?: number
    error?: string | null
    scheduledAt?: Date | string
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type JobQueueCreateOrConnectWithoutGameInput = {
    where: JobQueueWhereUniqueInput
    create: XOR<JobQueueCreateWithoutGameInput, JobQueueUncheckedCreateWithoutGameInput>
  }

  export type JobQueueCreateManyGameInputEnvelope = {
    data: JobQueueCreateManyGameInput | JobQueueCreateManyGameInput[]
  }

  export type PlayerUpsertWithWhereUniqueWithoutGameInput = {
    where: PlayerWhereUniqueInput
    update: XOR<PlayerUpdateWithoutGameInput, PlayerUncheckedUpdateWithoutGameInput>
    create: XOR<PlayerCreateWithoutGameInput, PlayerUncheckedCreateWithoutGameInput>
  }

  export type PlayerUpdateWithWhereUniqueWithoutGameInput = {
    where: PlayerWhereUniqueInput
    data: XOR<PlayerUpdateWithoutGameInput, PlayerUncheckedUpdateWithoutGameInput>
  }

  export type PlayerUpdateManyWithWhereWithoutGameInput = {
    where: PlayerScalarWhereInput
    data: XOR<PlayerUpdateManyMutationInput, PlayerUncheckedUpdateManyWithoutGameInput>
  }

  export type PlayerScalarWhereInput = {
    AND?: PlayerScalarWhereInput | PlayerScalarWhereInput[]
    OR?: PlayerScalarWhereInput[]
    NOT?: PlayerScalarWhereInput | PlayerScalarWhereInput[]
    id?: StringFilter<"Player"> | string
    gameId?: StringFilter<"Player"> | string
    username?: StringFilter<"Player"> | string
    displayName?: StringNullableFilter<"Player"> | string | null
    userId?: StringNullableFilter<"Player"> | string | null
    isActive?: BoolFilter<"Player"> | boolean
    createdAt?: DateTimeFilter<"Player"> | Date | string
    updatedAt?: DateTimeFilter<"Player"> | Date | string
  }

  export type MatchUpsertWithWhereUniqueWithoutGameInput = {
    where: MatchWhereUniqueInput
    update: XOR<MatchUpdateWithoutGameInput, MatchUncheckedUpdateWithoutGameInput>
    create: XOR<MatchCreateWithoutGameInput, MatchUncheckedCreateWithoutGameInput>
  }

  export type MatchUpdateWithWhereUniqueWithoutGameInput = {
    where: MatchWhereUniqueInput
    data: XOR<MatchUpdateWithoutGameInput, MatchUncheckedUpdateWithoutGameInput>
  }

  export type MatchUpdateManyWithWhereWithoutGameInput = {
    where: MatchScalarWhereInput
    data: XOR<MatchUpdateManyMutationInput, MatchUncheckedUpdateManyWithoutGameInput>
  }

  export type MatchScalarWhereInput = {
    AND?: MatchScalarWhereInput | MatchScalarWhereInput[]
    OR?: MatchScalarWhereInput[]
    NOT?: MatchScalarWhereInput | MatchScalarWhereInput[]
    id?: StringFilter<"Match"> | string
    gameId?: StringFilter<"Match"> | string
    mapId?: StringNullableFilter<"Match"> | string | null
    gameModeId?: StringNullableFilter<"Match"> | string | null
    matchCode?: StringNullableFilter<"Match"> | string | null
    startTime?: DateTimeFilter<"Match"> | Date | string
    endTime?: DateTimeNullableFilter<"Match"> | Date | string | null
    status?: StringFilter<"Match"> | string
    metadata?: StringNullableFilter<"Match"> | string | null
    createdAt?: DateTimeFilter<"Match"> | Date | string
    updatedAt?: DateTimeFilter<"Match"> | Date | string
  }

  export type CharacterUpsertWithWhereUniqueWithoutGameInput = {
    where: CharacterWhereUniqueInput
    update: XOR<CharacterUpdateWithoutGameInput, CharacterUncheckedUpdateWithoutGameInput>
    create: XOR<CharacterCreateWithoutGameInput, CharacterUncheckedCreateWithoutGameInput>
  }

  export type CharacterUpdateWithWhereUniqueWithoutGameInput = {
    where: CharacterWhereUniqueInput
    data: XOR<CharacterUpdateWithoutGameInput, CharacterUncheckedUpdateWithoutGameInput>
  }

  export type CharacterUpdateManyWithWhereWithoutGameInput = {
    where: CharacterScalarWhereInput
    data: XOR<CharacterUpdateManyMutationInput, CharacterUncheckedUpdateManyWithoutGameInput>
  }

  export type CharacterScalarWhereInput = {
    AND?: CharacterScalarWhereInput | CharacterScalarWhereInput[]
    OR?: CharacterScalarWhereInput[]
    NOT?: CharacterScalarWhereInput | CharacterScalarWhereInput[]
    id?: StringFilter<"Character"> | string
    gameId?: StringFilter<"Character"> | string
    name?: StringFilter<"Character"> | string
    displayName?: StringFilter<"Character"> | string
    role?: StringFilter<"Character"> | string
    isActive?: BoolFilter<"Character"> | boolean
    createdAt?: DateTimeFilter<"Character"> | Date | string
    updatedAt?: DateTimeFilter<"Character"> | Date | string
  }

  export type MapUpsertWithWhereUniqueWithoutGameInput = {
    where: MapWhereUniqueInput
    update: XOR<MapUpdateWithoutGameInput, MapUncheckedUpdateWithoutGameInput>
    create: XOR<MapCreateWithoutGameInput, MapUncheckedCreateWithoutGameInput>
  }

  export type MapUpdateWithWhereUniqueWithoutGameInput = {
    where: MapWhereUniqueInput
    data: XOR<MapUpdateWithoutGameInput, MapUncheckedUpdateWithoutGameInput>
  }

  export type MapUpdateManyWithWhereWithoutGameInput = {
    where: MapScalarWhereInput
    data: XOR<MapUpdateManyMutationInput, MapUncheckedUpdateManyWithoutGameInput>
  }

  export type MapScalarWhereInput = {
    AND?: MapScalarWhereInput | MapScalarWhereInput[]
    OR?: MapScalarWhereInput[]
    NOT?: MapScalarWhereInput | MapScalarWhereInput[]
    id?: StringFilter<"Map"> | string
    gameId?: StringFilter<"Map"> | string
    name?: StringFilter<"Map"> | string
    displayName?: StringFilter<"Map"> | string
    mapType?: StringFilter<"Map"> | string
    isActive?: BoolFilter<"Map"> | boolean
    createdAt?: DateTimeFilter<"Map"> | Date | string
    updatedAt?: DateTimeFilter<"Map"> | Date | string
  }

  export type GameModeUpsertWithWhereUniqueWithoutGameInput = {
    where: GameModeWhereUniqueInput
    update: XOR<GameModeUpdateWithoutGameInput, GameModeUncheckedUpdateWithoutGameInput>
    create: XOR<GameModeCreateWithoutGameInput, GameModeUncheckedCreateWithoutGameInput>
  }

  export type GameModeUpdateWithWhereUniqueWithoutGameInput = {
    where: GameModeWhereUniqueInput
    data: XOR<GameModeUpdateWithoutGameInput, GameModeUncheckedUpdateWithoutGameInput>
  }

  export type GameModeUpdateManyWithWhereWithoutGameInput = {
    where: GameModeScalarWhereInput
    data: XOR<GameModeUpdateManyMutationInput, GameModeUncheckedUpdateManyWithoutGameInput>
  }

  export type GameModeScalarWhereInput = {
    AND?: GameModeScalarWhereInput | GameModeScalarWhereInput[]
    OR?: GameModeScalarWhereInput[]
    NOT?: GameModeScalarWhereInput | GameModeScalarWhereInput[]
    id?: StringFilter<"GameMode"> | string
    gameId?: StringFilter<"GameMode"> | string
    name?: StringFilter<"GameMode"> | string
    displayName?: StringFilter<"GameMode"> | string
    isActive?: BoolFilter<"GameMode"> | boolean
    createdAt?: DateTimeFilter<"GameMode"> | Date | string
    updatedAt?: DateTimeFilter<"GameMode"> | Date | string
  }

  export type PlayerStatsUpsertWithWhereUniqueWithoutGameInput = {
    where: PlayerStatsWhereUniqueInput
    update: XOR<PlayerStatsUpdateWithoutGameInput, PlayerStatsUncheckedUpdateWithoutGameInput>
    create: XOR<PlayerStatsCreateWithoutGameInput, PlayerStatsUncheckedCreateWithoutGameInput>
  }

  export type PlayerStatsUpdateWithWhereUniqueWithoutGameInput = {
    where: PlayerStatsWhereUniqueInput
    data: XOR<PlayerStatsUpdateWithoutGameInput, PlayerStatsUncheckedUpdateWithoutGameInput>
  }

  export type PlayerStatsUpdateManyWithWhereWithoutGameInput = {
    where: PlayerStatsScalarWhereInput
    data: XOR<PlayerStatsUpdateManyMutationInput, PlayerStatsUncheckedUpdateManyWithoutGameInput>
  }

  export type PlayerStatsScalarWhereInput = {
    AND?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
    OR?: PlayerStatsScalarWhereInput[]
    NOT?: PlayerStatsScalarWhereInput | PlayerStatsScalarWhereInput[]
    id?: StringFilter<"PlayerStats"> | string
    gameId?: StringFilter<"PlayerStats"> | string
    playerId?: StringFilter<"PlayerStats"> | string
    matchId?: StringNullableFilter<"PlayerStats"> | string | null
    statType?: StringFilter<"PlayerStats"> | string
    period?: StringNullableFilter<"PlayerStats"> | string | null
    statisticsJson?: StringFilter<"PlayerStats"> | string
    createdAt?: DateTimeFilter<"PlayerStats"> | Date | string
    updatedAt?: DateTimeFilter<"PlayerStats"> | Date | string
  }

  export type JobQueueUpsertWithWhereUniqueWithoutGameInput = {
    where: JobQueueWhereUniqueInput
    update: XOR<JobQueueUpdateWithoutGameInput, JobQueueUncheckedUpdateWithoutGameInput>
    create: XOR<JobQueueCreateWithoutGameInput, JobQueueUncheckedCreateWithoutGameInput>
  }

  export type JobQueueUpdateWithWhereUniqueWithoutGameInput = {
    where: JobQueueWhereUniqueInput
    data: XOR<JobQueueUpdateWithoutGameInput, JobQueueUncheckedUpdateWithoutGameInput>
  }

  export type JobQueueUpdateManyWithWhereWithoutGameInput = {
    where: JobQueueScalarWhereInput
    data: XOR<JobQueueUpdateManyMutationInput, JobQueueUncheckedUpdateManyWithoutGameInput>
  }

  export type JobQueueScalarWhereInput = {
    AND?: JobQueueScalarWhereInput | JobQueueScalarWhereInput[]
    OR?: JobQueueScalarWhereInput[]
    NOT?: JobQueueScalarWhereInput | JobQueueScalarWhereInput[]
    id?: StringFilter<"JobQueue"> | string
    gameId?: StringNullableFilter<"JobQueue"> | string | null
    jobType?: StringFilter<"JobQueue"> | string
    status?: StringFilter<"JobQueue"> | string
    priority?: IntFilter<"JobQueue"> | number
    payload?: StringNullableFilter<"JobQueue"> | string | null
    attempts?: IntFilter<"JobQueue"> | number
    maxAttempts?: IntFilter<"JobQueue"> | number
    error?: StringNullableFilter<"JobQueue"> | string | null
    scheduledAt?: DateTimeFilter<"JobQueue"> | Date | string
    startedAt?: DateTimeNullableFilter<"JobQueue"> | Date | string | null
    completedAt?: DateTimeNullableFilter<"JobQueue"> | Date | string | null
    createdAt?: DateTimeFilter<"JobQueue"> | Date | string
    updatedAt?: DateTimeFilter<"JobQueue"> | Date | string
  }

  export type GameCreateWithoutPlayersInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutPlayersInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutPlayersInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutPlayersInput, GameUncheckedCreateWithoutPlayersInput>
  }

  export type PlayerStatsCreateWithoutPlayerInput = {
    id?: string
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutPlayerStatsInput
    match?: MatchCreateNestedOneWithoutPlayerStatsInput
  }

  export type PlayerStatsUncheckedCreateWithoutPlayerInput = {
    id?: string
    gameId: string
    matchId?: string | null
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsCreateOrConnectWithoutPlayerInput = {
    where: PlayerStatsWhereUniqueInput
    create: XOR<PlayerStatsCreateWithoutPlayerInput, PlayerStatsUncheckedCreateWithoutPlayerInput>
  }

  export type PlayerStatsCreateManyPlayerInputEnvelope = {
    data: PlayerStatsCreateManyPlayerInput | PlayerStatsCreateManyPlayerInput[]
  }

  export type MatchResultCreateWithoutPlayerInput = {
    id?: string
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    match: MatchCreateNestedOneWithoutMatchResultsInput
    character?: CharacterCreateNestedOneWithoutMatchResultsInput
  }

  export type MatchResultUncheckedCreateWithoutPlayerInput = {
    id?: string
    matchId: string
    characterId?: string | null
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultCreateOrConnectWithoutPlayerInput = {
    where: MatchResultWhereUniqueInput
    create: XOR<MatchResultCreateWithoutPlayerInput, MatchResultUncheckedCreateWithoutPlayerInput>
  }

  export type MatchResultCreateManyPlayerInputEnvelope = {
    data: MatchResultCreateManyPlayerInput | MatchResultCreateManyPlayerInput[]
  }

  export type GameUpsertWithoutPlayersInput = {
    update: XOR<GameUpdateWithoutPlayersInput, GameUncheckedUpdateWithoutPlayersInput>
    create: XOR<GameCreateWithoutPlayersInput, GameUncheckedCreateWithoutPlayersInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutPlayersInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutPlayersInput, GameUncheckedUpdateWithoutPlayersInput>
  }

  export type GameUpdateWithoutPlayersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutPlayersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type PlayerStatsUpsertWithWhereUniqueWithoutPlayerInput = {
    where: PlayerStatsWhereUniqueInput
    update: XOR<PlayerStatsUpdateWithoutPlayerInput, PlayerStatsUncheckedUpdateWithoutPlayerInput>
    create: XOR<PlayerStatsCreateWithoutPlayerInput, PlayerStatsUncheckedCreateWithoutPlayerInput>
  }

  export type PlayerStatsUpdateWithWhereUniqueWithoutPlayerInput = {
    where: PlayerStatsWhereUniqueInput
    data: XOR<PlayerStatsUpdateWithoutPlayerInput, PlayerStatsUncheckedUpdateWithoutPlayerInput>
  }

  export type PlayerStatsUpdateManyWithWhereWithoutPlayerInput = {
    where: PlayerStatsScalarWhereInput
    data: XOR<PlayerStatsUpdateManyMutationInput, PlayerStatsUncheckedUpdateManyWithoutPlayerInput>
  }

  export type MatchResultUpsertWithWhereUniqueWithoutPlayerInput = {
    where: MatchResultWhereUniqueInput
    update: XOR<MatchResultUpdateWithoutPlayerInput, MatchResultUncheckedUpdateWithoutPlayerInput>
    create: XOR<MatchResultCreateWithoutPlayerInput, MatchResultUncheckedCreateWithoutPlayerInput>
  }

  export type MatchResultUpdateWithWhereUniqueWithoutPlayerInput = {
    where: MatchResultWhereUniqueInput
    data: XOR<MatchResultUpdateWithoutPlayerInput, MatchResultUncheckedUpdateWithoutPlayerInput>
  }

  export type MatchResultUpdateManyWithWhereWithoutPlayerInput = {
    where: MatchResultScalarWhereInput
    data: XOR<MatchResultUpdateManyMutationInput, MatchResultUncheckedUpdateManyWithoutPlayerInput>
  }

  export type MatchResultScalarWhereInput = {
    AND?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
    OR?: MatchResultScalarWhereInput[]
    NOT?: MatchResultScalarWhereInput | MatchResultScalarWhereInput[]
    id?: StringFilter<"MatchResult"> | string
    matchId?: StringFilter<"MatchResult"> | string
    playerId?: StringFilter<"MatchResult"> | string
    characterId?: StringNullableFilter<"MatchResult"> | string | null
    team?: StringNullableFilter<"MatchResult"> | string | null
    result?: StringNullableFilter<"MatchResult"> | string | null
    score?: IntNullableFilter<"MatchResult"> | number | null
    placement?: IntNullableFilter<"MatchResult"> | number | null
    statsJson?: StringNullableFilter<"MatchResult"> | string | null
    createdAt?: DateTimeFilter<"MatchResult"> | Date | string
    updatedAt?: DateTimeFilter<"MatchResult"> | Date | string
  }

  export type GameCreateWithoutCharactersInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    matches?: MatchCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutCharactersInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutCharactersInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutCharactersInput, GameUncheckedCreateWithoutCharactersInput>
  }

  export type MatchResultCreateWithoutCharacterInput = {
    id?: string
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    match: MatchCreateNestedOneWithoutMatchResultsInput
    player: PlayerCreateNestedOneWithoutMatchResultsInput
  }

  export type MatchResultUncheckedCreateWithoutCharacterInput = {
    id?: string
    matchId: string
    playerId: string
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultCreateOrConnectWithoutCharacterInput = {
    where: MatchResultWhereUniqueInput
    create: XOR<MatchResultCreateWithoutCharacterInput, MatchResultUncheckedCreateWithoutCharacterInput>
  }

  export type MatchResultCreateManyCharacterInputEnvelope = {
    data: MatchResultCreateManyCharacterInput | MatchResultCreateManyCharacterInput[]
  }

  export type GameUpsertWithoutCharactersInput = {
    update: XOR<GameUpdateWithoutCharactersInput, GameUncheckedUpdateWithoutCharactersInput>
    create: XOR<GameCreateWithoutCharactersInput, GameUncheckedCreateWithoutCharactersInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutCharactersInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutCharactersInput, GameUncheckedUpdateWithoutCharactersInput>
  }

  export type GameUpdateWithoutCharactersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    matches?: MatchUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutCharactersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type MatchResultUpsertWithWhereUniqueWithoutCharacterInput = {
    where: MatchResultWhereUniqueInput
    update: XOR<MatchResultUpdateWithoutCharacterInput, MatchResultUncheckedUpdateWithoutCharacterInput>
    create: XOR<MatchResultCreateWithoutCharacterInput, MatchResultUncheckedCreateWithoutCharacterInput>
  }

  export type MatchResultUpdateWithWhereUniqueWithoutCharacterInput = {
    where: MatchResultWhereUniqueInput
    data: XOR<MatchResultUpdateWithoutCharacterInput, MatchResultUncheckedUpdateWithoutCharacterInput>
  }

  export type MatchResultUpdateManyWithWhereWithoutCharacterInput = {
    where: MatchResultScalarWhereInput
    data: XOR<MatchResultUpdateManyMutationInput, MatchResultUncheckedUpdateManyWithoutCharacterInput>
  }

  export type GameCreateWithoutMapsInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    matches?: MatchCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutMapsInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutMapsInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutMapsInput, GameUncheckedCreateWithoutMapsInput>
  }

  export type MatchCreateWithoutMapInput = {
    id?: string
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMatchesInput
    gameMode?: GameModeCreateNestedOneWithoutMatchesInput
    matchResults?: MatchResultCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsCreateNestedManyWithoutMatchInput
  }

  export type MatchUncheckedCreateWithoutMapInput = {
    id?: string
    gameId: string
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutMatchInput
  }

  export type MatchCreateOrConnectWithoutMapInput = {
    where: MatchWhereUniqueInput
    create: XOR<MatchCreateWithoutMapInput, MatchUncheckedCreateWithoutMapInput>
  }

  export type MatchCreateManyMapInputEnvelope = {
    data: MatchCreateManyMapInput | MatchCreateManyMapInput[]
  }

  export type GameUpsertWithoutMapsInput = {
    update: XOR<GameUpdateWithoutMapsInput, GameUncheckedUpdateWithoutMapsInput>
    create: XOR<GameCreateWithoutMapsInput, GameUncheckedCreateWithoutMapsInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutMapsInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutMapsInput, GameUncheckedUpdateWithoutMapsInput>
  }

  export type GameUpdateWithoutMapsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    matches?: MatchUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutMapsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type MatchUpsertWithWhereUniqueWithoutMapInput = {
    where: MatchWhereUniqueInput
    update: XOR<MatchUpdateWithoutMapInput, MatchUncheckedUpdateWithoutMapInput>
    create: XOR<MatchCreateWithoutMapInput, MatchUncheckedCreateWithoutMapInput>
  }

  export type MatchUpdateWithWhereUniqueWithoutMapInput = {
    where: MatchWhereUniqueInput
    data: XOR<MatchUpdateWithoutMapInput, MatchUncheckedUpdateWithoutMapInput>
  }

  export type MatchUpdateManyWithWhereWithoutMapInput = {
    where: MatchScalarWhereInput
    data: XOR<MatchUpdateManyMutationInput, MatchUncheckedUpdateManyWithoutMapInput>
  }

  export type GameCreateWithoutGameModesInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    matches?: MatchCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutGameModesInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutGameModesInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutGameModesInput, GameUncheckedCreateWithoutGameModesInput>
  }

  export type MatchCreateWithoutGameModeInput = {
    id?: string
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMatchesInput
    map?: MapCreateNestedOneWithoutMatchesInput
    matchResults?: MatchResultCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsCreateNestedManyWithoutMatchInput
  }

  export type MatchUncheckedCreateWithoutGameModeInput = {
    id?: string
    gameId: string
    mapId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutMatchInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutMatchInput
  }

  export type MatchCreateOrConnectWithoutGameModeInput = {
    where: MatchWhereUniqueInput
    create: XOR<MatchCreateWithoutGameModeInput, MatchUncheckedCreateWithoutGameModeInput>
  }

  export type MatchCreateManyGameModeInputEnvelope = {
    data: MatchCreateManyGameModeInput | MatchCreateManyGameModeInput[]
  }

  export type GameUpsertWithoutGameModesInput = {
    update: XOR<GameUpdateWithoutGameModesInput, GameUncheckedUpdateWithoutGameModesInput>
    create: XOR<GameCreateWithoutGameModesInput, GameUncheckedCreateWithoutGameModesInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutGameModesInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutGameModesInput, GameUncheckedUpdateWithoutGameModesInput>
  }

  export type GameUpdateWithoutGameModesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    matches?: MatchUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutGameModesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type MatchUpsertWithWhereUniqueWithoutGameModeInput = {
    where: MatchWhereUniqueInput
    update: XOR<MatchUpdateWithoutGameModeInput, MatchUncheckedUpdateWithoutGameModeInput>
    create: XOR<MatchCreateWithoutGameModeInput, MatchUncheckedCreateWithoutGameModeInput>
  }

  export type MatchUpdateWithWhereUniqueWithoutGameModeInput = {
    where: MatchWhereUniqueInput
    data: XOR<MatchUpdateWithoutGameModeInput, MatchUncheckedUpdateWithoutGameModeInput>
  }

  export type MatchUpdateManyWithWhereWithoutGameModeInput = {
    where: MatchScalarWhereInput
    data: XOR<MatchUpdateManyMutationInput, MatchUncheckedUpdateManyWithoutGameModeInput>
  }

  export type GameCreateWithoutMatchesInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutMatchesInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutMatchesInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutMatchesInput, GameUncheckedCreateWithoutMatchesInput>
  }

  export type MapCreateWithoutMatchesInput = {
    id?: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMapsInput
  }

  export type MapUncheckedCreateWithoutMatchesInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MapCreateOrConnectWithoutMatchesInput = {
    where: MapWhereUniqueInput
    create: XOR<MapCreateWithoutMatchesInput, MapUncheckedCreateWithoutMatchesInput>
  }

  export type GameModeCreateWithoutMatchesInput = {
    id?: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutGameModesInput
  }

  export type GameModeUncheckedCreateWithoutMatchesInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GameModeCreateOrConnectWithoutMatchesInput = {
    where: GameModeWhereUniqueInput
    create: XOR<GameModeCreateWithoutMatchesInput, GameModeUncheckedCreateWithoutMatchesInput>
  }

  export type MatchResultCreateWithoutMatchInput = {
    id?: string
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    player: PlayerCreateNestedOneWithoutMatchResultsInput
    character?: CharacterCreateNestedOneWithoutMatchResultsInput
  }

  export type MatchResultUncheckedCreateWithoutMatchInput = {
    id?: string
    playerId: string
    characterId?: string | null
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultCreateOrConnectWithoutMatchInput = {
    where: MatchResultWhereUniqueInput
    create: XOR<MatchResultCreateWithoutMatchInput, MatchResultUncheckedCreateWithoutMatchInput>
  }

  export type MatchResultCreateManyMatchInputEnvelope = {
    data: MatchResultCreateManyMatchInput | MatchResultCreateManyMatchInput[]
  }

  export type PlayerStatsCreateWithoutMatchInput = {
    id?: string
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutPlayerStatsInput
    player: PlayerCreateNestedOneWithoutPlayerStatsInput
  }

  export type PlayerStatsUncheckedCreateWithoutMatchInput = {
    id?: string
    gameId: string
    playerId: string
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsCreateOrConnectWithoutMatchInput = {
    where: PlayerStatsWhereUniqueInput
    create: XOR<PlayerStatsCreateWithoutMatchInput, PlayerStatsUncheckedCreateWithoutMatchInput>
  }

  export type PlayerStatsCreateManyMatchInputEnvelope = {
    data: PlayerStatsCreateManyMatchInput | PlayerStatsCreateManyMatchInput[]
  }

  export type GameUpsertWithoutMatchesInput = {
    update: XOR<GameUpdateWithoutMatchesInput, GameUncheckedUpdateWithoutMatchesInput>
    create: XOR<GameCreateWithoutMatchesInput, GameUncheckedCreateWithoutMatchesInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutMatchesInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutMatchesInput, GameUncheckedUpdateWithoutMatchesInput>
  }

  export type GameUpdateWithoutMatchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutMatchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type MapUpsertWithoutMatchesInput = {
    update: XOR<MapUpdateWithoutMatchesInput, MapUncheckedUpdateWithoutMatchesInput>
    create: XOR<MapCreateWithoutMatchesInput, MapUncheckedCreateWithoutMatchesInput>
    where?: MapWhereInput
  }

  export type MapUpdateToOneWithWhereWithoutMatchesInput = {
    where?: MapWhereInput
    data: XOR<MapUpdateWithoutMatchesInput, MapUncheckedUpdateWithoutMatchesInput>
  }

  export type MapUpdateWithoutMatchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMapsNestedInput
  }

  export type MapUncheckedUpdateWithoutMatchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameModeUpsertWithoutMatchesInput = {
    update: XOR<GameModeUpdateWithoutMatchesInput, GameModeUncheckedUpdateWithoutMatchesInput>
    create: XOR<GameModeCreateWithoutMatchesInput, GameModeUncheckedCreateWithoutMatchesInput>
    where?: GameModeWhereInput
  }

  export type GameModeUpdateToOneWithWhereWithoutMatchesInput = {
    where?: GameModeWhereInput
    data: XOR<GameModeUpdateWithoutMatchesInput, GameModeUncheckedUpdateWithoutMatchesInput>
  }

  export type GameModeUpdateWithoutMatchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutGameModesNestedInput
  }

  export type GameModeUncheckedUpdateWithoutMatchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultUpsertWithWhereUniqueWithoutMatchInput = {
    where: MatchResultWhereUniqueInput
    update: XOR<MatchResultUpdateWithoutMatchInput, MatchResultUncheckedUpdateWithoutMatchInput>
    create: XOR<MatchResultCreateWithoutMatchInput, MatchResultUncheckedCreateWithoutMatchInput>
  }

  export type MatchResultUpdateWithWhereUniqueWithoutMatchInput = {
    where: MatchResultWhereUniqueInput
    data: XOR<MatchResultUpdateWithoutMatchInput, MatchResultUncheckedUpdateWithoutMatchInput>
  }

  export type MatchResultUpdateManyWithWhereWithoutMatchInput = {
    where: MatchResultScalarWhereInput
    data: XOR<MatchResultUpdateManyMutationInput, MatchResultUncheckedUpdateManyWithoutMatchInput>
  }

  export type PlayerStatsUpsertWithWhereUniqueWithoutMatchInput = {
    where: PlayerStatsWhereUniqueInput
    update: XOR<PlayerStatsUpdateWithoutMatchInput, PlayerStatsUncheckedUpdateWithoutMatchInput>
    create: XOR<PlayerStatsCreateWithoutMatchInput, PlayerStatsUncheckedCreateWithoutMatchInput>
  }

  export type PlayerStatsUpdateWithWhereUniqueWithoutMatchInput = {
    where: PlayerStatsWhereUniqueInput
    data: XOR<PlayerStatsUpdateWithoutMatchInput, PlayerStatsUncheckedUpdateWithoutMatchInput>
  }

  export type PlayerStatsUpdateManyWithWhereWithoutMatchInput = {
    where: PlayerStatsScalarWhereInput
    data: XOR<PlayerStatsUpdateManyMutationInput, PlayerStatsUncheckedUpdateManyWithoutMatchInput>
  }

  export type MatchCreateWithoutMatchResultsInput = {
    id?: string
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMatchesInput
    map?: MapCreateNestedOneWithoutMatchesInput
    gameMode?: GameModeCreateNestedOneWithoutMatchesInput
    playerStats?: PlayerStatsCreateNestedManyWithoutMatchInput
  }

  export type MatchUncheckedCreateWithoutMatchResultsInput = {
    id?: string
    gameId: string
    mapId?: string | null
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutMatchInput
  }

  export type MatchCreateOrConnectWithoutMatchResultsInput = {
    where: MatchWhereUniqueInput
    create: XOR<MatchCreateWithoutMatchResultsInput, MatchUncheckedCreateWithoutMatchResultsInput>
  }

  export type PlayerCreateWithoutMatchResultsInput = {
    id?: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutPlayersInput
    playerStats?: PlayerStatsCreateNestedManyWithoutPlayerInput
  }

  export type PlayerUncheckedCreateWithoutMatchResultsInput = {
    id?: string
    gameId: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutPlayerInput
  }

  export type PlayerCreateOrConnectWithoutMatchResultsInput = {
    where: PlayerWhereUniqueInput
    create: XOR<PlayerCreateWithoutMatchResultsInput, PlayerUncheckedCreateWithoutMatchResultsInput>
  }

  export type CharacterCreateWithoutMatchResultsInput = {
    id?: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutCharactersInput
  }

  export type CharacterUncheckedCreateWithoutMatchResultsInput = {
    id?: string
    gameId: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CharacterCreateOrConnectWithoutMatchResultsInput = {
    where: CharacterWhereUniqueInput
    create: XOR<CharacterCreateWithoutMatchResultsInput, CharacterUncheckedCreateWithoutMatchResultsInput>
  }

  export type MatchUpsertWithoutMatchResultsInput = {
    update: XOR<MatchUpdateWithoutMatchResultsInput, MatchUncheckedUpdateWithoutMatchResultsInput>
    create: XOR<MatchCreateWithoutMatchResultsInput, MatchUncheckedCreateWithoutMatchResultsInput>
    where?: MatchWhereInput
  }

  export type MatchUpdateToOneWithWhereWithoutMatchResultsInput = {
    where?: MatchWhereInput
    data: XOR<MatchUpdateWithoutMatchResultsInput, MatchUncheckedUpdateWithoutMatchResultsInput>
  }

  export type MatchUpdateWithoutMatchResultsInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMatchesNestedInput
    map?: MapUpdateOneWithoutMatchesNestedInput
    gameMode?: GameModeUpdateOneWithoutMatchesNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateWithoutMatchResultsInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutMatchNestedInput
  }

  export type PlayerUpsertWithoutMatchResultsInput = {
    update: XOR<PlayerUpdateWithoutMatchResultsInput, PlayerUncheckedUpdateWithoutMatchResultsInput>
    create: XOR<PlayerCreateWithoutMatchResultsInput, PlayerUncheckedCreateWithoutMatchResultsInput>
    where?: PlayerWhereInput
  }

  export type PlayerUpdateToOneWithWhereWithoutMatchResultsInput = {
    where?: PlayerWhereInput
    data: XOR<PlayerUpdateWithoutMatchResultsInput, PlayerUncheckedUpdateWithoutMatchResultsInput>
  }

  export type PlayerUpdateWithoutMatchResultsInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutPlayersNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutPlayerNestedInput
  }

  export type PlayerUncheckedUpdateWithoutMatchResultsInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutPlayerNestedInput
  }

  export type CharacterUpsertWithoutMatchResultsInput = {
    update: XOR<CharacterUpdateWithoutMatchResultsInput, CharacterUncheckedUpdateWithoutMatchResultsInput>
    create: XOR<CharacterCreateWithoutMatchResultsInput, CharacterUncheckedCreateWithoutMatchResultsInput>
    where?: CharacterWhereInput
  }

  export type CharacterUpdateToOneWithWhereWithoutMatchResultsInput = {
    where?: CharacterWhereInput
    data: XOR<CharacterUpdateWithoutMatchResultsInput, CharacterUncheckedUpdateWithoutMatchResultsInput>
  }

  export type CharacterUpdateWithoutMatchResultsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutCharactersNestedInput
  }

  export type CharacterUncheckedUpdateWithoutMatchResultsInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameCreateWithoutPlayerStatsInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    matches?: MatchCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutPlayerStatsInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    jobQueue?: JobQueueUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutPlayerStatsInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutPlayerStatsInput, GameUncheckedCreateWithoutPlayerStatsInput>
  }

  export type PlayerCreateWithoutPlayerStatsInput = {
    id?: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutPlayersInput
    matchResults?: MatchResultCreateNestedManyWithoutPlayerInput
  }

  export type PlayerUncheckedCreateWithoutPlayerStatsInput = {
    id?: string
    gameId: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutPlayerInput
  }

  export type PlayerCreateOrConnectWithoutPlayerStatsInput = {
    where: PlayerWhereUniqueInput
    create: XOR<PlayerCreateWithoutPlayerStatsInput, PlayerUncheckedCreateWithoutPlayerStatsInput>
  }

  export type MatchCreateWithoutPlayerStatsInput = {
    id?: string
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    game: GameCreateNestedOneWithoutMatchesInput
    map?: MapCreateNestedOneWithoutMatchesInput
    gameMode?: GameModeCreateNestedOneWithoutMatchesInput
    matchResults?: MatchResultCreateNestedManyWithoutMatchInput
  }

  export type MatchUncheckedCreateWithoutPlayerStatsInput = {
    id?: string
    gameId: string
    mapId?: string | null
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    matchResults?: MatchResultUncheckedCreateNestedManyWithoutMatchInput
  }

  export type MatchCreateOrConnectWithoutPlayerStatsInput = {
    where: MatchWhereUniqueInput
    create: XOR<MatchCreateWithoutPlayerStatsInput, MatchUncheckedCreateWithoutPlayerStatsInput>
  }

  export type GameUpsertWithoutPlayerStatsInput = {
    update: XOR<GameUpdateWithoutPlayerStatsInput, GameUncheckedUpdateWithoutPlayerStatsInput>
    create: XOR<GameCreateWithoutPlayerStatsInput, GameUncheckedCreateWithoutPlayerStatsInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutPlayerStatsInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutPlayerStatsInput, GameUncheckedUpdateWithoutPlayerStatsInput>
  }

  export type GameUpdateWithoutPlayerStatsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    matches?: MatchUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutPlayerStatsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    jobQueue?: JobQueueUncheckedUpdateManyWithoutGameNestedInput
  }

  export type PlayerUpsertWithoutPlayerStatsInput = {
    update: XOR<PlayerUpdateWithoutPlayerStatsInput, PlayerUncheckedUpdateWithoutPlayerStatsInput>
    create: XOR<PlayerCreateWithoutPlayerStatsInput, PlayerUncheckedCreateWithoutPlayerStatsInput>
    where?: PlayerWhereInput
  }

  export type PlayerUpdateToOneWithWhereWithoutPlayerStatsInput = {
    where?: PlayerWhereInput
    data: XOR<PlayerUpdateWithoutPlayerStatsInput, PlayerUncheckedUpdateWithoutPlayerStatsInput>
  }

  export type PlayerUpdateWithoutPlayerStatsInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutPlayersNestedInput
    matchResults?: MatchResultUpdateManyWithoutPlayerNestedInput
  }

  export type PlayerUncheckedUpdateWithoutPlayerStatsInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutPlayerNestedInput
  }

  export type MatchUpsertWithoutPlayerStatsInput = {
    update: XOR<MatchUpdateWithoutPlayerStatsInput, MatchUncheckedUpdateWithoutPlayerStatsInput>
    create: XOR<MatchCreateWithoutPlayerStatsInput, MatchUncheckedCreateWithoutPlayerStatsInput>
    where?: MatchWhereInput
  }

  export type MatchUpdateToOneWithWhereWithoutPlayerStatsInput = {
    where?: MatchWhereInput
    data: XOR<MatchUpdateWithoutPlayerStatsInput, MatchUncheckedUpdateWithoutPlayerStatsInput>
  }

  export type MatchUpdateWithoutPlayerStatsInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMatchesNestedInput
    map?: MapUpdateOneWithoutMatchesNestedInput
    gameMode?: GameModeUpdateOneWithoutMatchesNestedInput
    matchResults?: MatchResultUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateWithoutPlayerStatsInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutMatchNestedInput
  }

  export type GameCreateWithoutJobQueueInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerCreateNestedManyWithoutGameInput
    matches?: MatchCreateNestedManyWithoutGameInput
    characters?: CharacterCreateNestedManyWithoutGameInput
    maps?: MapCreateNestedManyWithoutGameInput
    gameModes?: GameModeCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsCreateNestedManyWithoutGameInput
  }

  export type GameUncheckedCreateWithoutJobQueueInput = {
    id: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    players?: PlayerUncheckedCreateNestedManyWithoutGameInput
    matches?: MatchUncheckedCreateNestedManyWithoutGameInput
    characters?: CharacterUncheckedCreateNestedManyWithoutGameInput
    maps?: MapUncheckedCreateNestedManyWithoutGameInput
    gameModes?: GameModeUncheckedCreateNestedManyWithoutGameInput
    playerStats?: PlayerStatsUncheckedCreateNestedManyWithoutGameInput
  }

  export type GameCreateOrConnectWithoutJobQueueInput = {
    where: GameWhereUniqueInput
    create: XOR<GameCreateWithoutJobQueueInput, GameUncheckedCreateWithoutJobQueueInput>
  }

  export type GameUpsertWithoutJobQueueInput = {
    update: XOR<GameUpdateWithoutJobQueueInput, GameUncheckedUpdateWithoutJobQueueInput>
    create: XOR<GameCreateWithoutJobQueueInput, GameUncheckedCreateWithoutJobQueueInput>
    where?: GameWhereInput
  }

  export type GameUpdateToOneWithWhereWithoutJobQueueInput = {
    where?: GameWhereInput
    data: XOR<GameUpdateWithoutJobQueueInput, GameUncheckedUpdateWithoutJobQueueInput>
  }

  export type GameUpdateWithoutJobQueueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUpdateManyWithoutGameNestedInput
    matches?: MatchUpdateManyWithoutGameNestedInput
    characters?: CharacterUpdateManyWithoutGameNestedInput
    maps?: MapUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutGameNestedInput
  }

  export type GameUncheckedUpdateWithoutJobQueueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    players?: PlayerUncheckedUpdateManyWithoutGameNestedInput
    matches?: MatchUncheckedUpdateManyWithoutGameNestedInput
    characters?: CharacterUncheckedUpdateManyWithoutGameNestedInput
    maps?: MapUncheckedUpdateManyWithoutGameNestedInput
    gameModes?: GameModeUncheckedUpdateManyWithoutGameNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutGameNestedInput
  }

  export type PlayerCreateManyGameInput = {
    id?: string
    username: string
    displayName?: string | null
    userId?: string | null
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchCreateManyGameInput = {
    id?: string
    mapId?: string | null
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CharacterCreateManyGameInput = {
    id?: string
    name: string
    displayName: string
    role: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MapCreateManyGameInput = {
    id?: string
    name: string
    displayName: string
    mapType: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GameModeCreateManyGameInput = {
    id?: string
    name: string
    displayName: string
    isActive?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsCreateManyGameInput = {
    id?: string
    playerId: string
    matchId?: string | null
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type JobQueueCreateManyGameInput = {
    id?: string
    jobType: string
    status?: string
    priority?: number
    payload?: string | null
    attempts?: number
    maxAttempts?: number
    error?: string | null
    scheduledAt?: Date | string
    startedAt?: Date | string | null
    completedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playerStats?: PlayerStatsUpdateManyWithoutPlayerNestedInput
    matchResults?: MatchResultUpdateManyWithoutPlayerNestedInput
  }

  export type PlayerUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutPlayerNestedInput
    matchResults?: MatchResultUncheckedUpdateManyWithoutPlayerNestedInput
  }

  export type PlayerUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    username?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    map?: MapUpdateOneWithoutMatchesNestedInput
    gameMode?: GameModeUpdateOneWithoutMatchesNestedInput
    matchResults?: MatchResultUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CharacterUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUpdateManyWithoutCharacterNestedInput
  }

  export type CharacterUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutCharacterNestedInput
  }

  export type CharacterUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MapUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUpdateManyWithoutMapNestedInput
  }

  export type MapUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUncheckedUpdateManyWithoutMapNestedInput
  }

  export type MapUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    mapType?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameModeUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUpdateManyWithoutGameModeNestedInput
  }

  export type GameModeUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matches?: MatchUncheckedUpdateManyWithoutGameModeNestedInput
  }

  export type GameModeUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    player?: PlayerUpdateOneRequiredWithoutPlayerStatsNestedInput
    match?: MatchUpdateOneWithoutPlayerStatsNestedInput
  }

  export type PlayerStatsUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    matchId?: NullableStringFieldUpdateOperationsInput | string | null
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    matchId?: NullableStringFieldUpdateOperationsInput | string | null
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type JobQueueUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type JobQueueUncheckedUpdateWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type JobQueueUncheckedUpdateManyWithoutGameInput = {
    id?: StringFieldUpdateOperationsInput | string
    jobType?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    priority?: IntFieldUpdateOperationsInput | number
    payload?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    maxAttempts?: IntFieldUpdateOperationsInput | number
    error?: NullableStringFieldUpdateOperationsInput | string | null
    scheduledAt?: DateTimeFieldUpdateOperationsInput | Date | string
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsCreateManyPlayerInput = {
    id?: string
    gameId: string
    matchId?: string | null
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultCreateManyPlayerInput = {
    id?: string
    matchId: string
    characterId?: string | null
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsUpdateWithoutPlayerInput = {
    id?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutPlayerStatsNestedInput
    match?: MatchUpdateOneWithoutPlayerStatsNestedInput
  }

  export type PlayerStatsUncheckedUpdateWithoutPlayerInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    matchId?: NullableStringFieldUpdateOperationsInput | string | null
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsUncheckedUpdateManyWithoutPlayerInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    matchId?: NullableStringFieldUpdateOperationsInput | string | null
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultUpdateWithoutPlayerInput = {
    id?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    match?: MatchUpdateOneRequiredWithoutMatchResultsNestedInput
    character?: CharacterUpdateOneWithoutMatchResultsNestedInput
  }

  export type MatchResultUncheckedUpdateWithoutPlayerInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchId?: StringFieldUpdateOperationsInput | string
    characterId?: NullableStringFieldUpdateOperationsInput | string | null
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultUncheckedUpdateManyWithoutPlayerInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchId?: StringFieldUpdateOperationsInput | string
    characterId?: NullableStringFieldUpdateOperationsInput | string | null
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultCreateManyCharacterInput = {
    id?: string
    matchId: string
    playerId: string
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultUpdateWithoutCharacterInput = {
    id?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    match?: MatchUpdateOneRequiredWithoutMatchResultsNestedInput
    player?: PlayerUpdateOneRequiredWithoutMatchResultsNestedInput
  }

  export type MatchResultUncheckedUpdateWithoutCharacterInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultUncheckedUpdateManyWithoutCharacterInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchCreateManyMapInput = {
    id?: string
    gameId: string
    gameModeId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchUpdateWithoutMapInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMatchesNestedInput
    gameMode?: GameModeUpdateOneWithoutMatchesNestedInput
    matchResults?: MatchResultUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateWithoutMapInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateManyWithoutMapInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    gameModeId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchCreateManyGameModeInput = {
    id?: string
    gameId: string
    mapId?: string | null
    matchCode?: string | null
    startTime: Date | string
    endTime?: Date | string | null
    status?: string
    metadata?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchUpdateWithoutGameModeInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutMatchesNestedInput
    map?: MapUpdateOneWithoutMatchesNestedInput
    matchResults?: MatchResultUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateWithoutGameModeInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    matchResults?: MatchResultUncheckedUpdateManyWithoutMatchNestedInput
    playerStats?: PlayerStatsUncheckedUpdateManyWithoutMatchNestedInput
  }

  export type MatchUncheckedUpdateManyWithoutGameModeInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    mapId?: NullableStringFieldUpdateOperationsInput | string | null
    matchCode?: NullableStringFieldUpdateOperationsInput | string | null
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    status?: StringFieldUpdateOperationsInput | string
    metadata?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultCreateManyMatchInput = {
    id?: string
    playerId: string
    characterId?: string | null
    team?: string | null
    result?: string | null
    score?: number | null
    placement?: number | null
    statsJson?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PlayerStatsCreateManyMatchInput = {
    id?: string
    gameId: string
    playerId: string
    statType: string
    period?: string | null
    statisticsJson: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type MatchResultUpdateWithoutMatchInput = {
    id?: StringFieldUpdateOperationsInput | string
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    player?: PlayerUpdateOneRequiredWithoutMatchResultsNestedInput
    character?: CharacterUpdateOneWithoutMatchResultsNestedInput
  }

  export type MatchResultUncheckedUpdateWithoutMatchInput = {
    id?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    characterId?: NullableStringFieldUpdateOperationsInput | string | null
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MatchResultUncheckedUpdateManyWithoutMatchInput = {
    id?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    characterId?: NullableStringFieldUpdateOperationsInput | string | null
    team?: NullableStringFieldUpdateOperationsInput | string | null
    result?: NullableStringFieldUpdateOperationsInput | string | null
    score?: NullableIntFieldUpdateOperationsInput | number | null
    placement?: NullableIntFieldUpdateOperationsInput | number | null
    statsJson?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsUpdateWithoutMatchInput = {
    id?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    game?: GameUpdateOneRequiredWithoutPlayerStatsNestedInput
    player?: PlayerUpdateOneRequiredWithoutPlayerStatsNestedInput
  }

  export type PlayerStatsUncheckedUpdateWithoutMatchInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PlayerStatsUncheckedUpdateManyWithoutMatchInput = {
    id?: StringFieldUpdateOperationsInput | string
    gameId?: StringFieldUpdateOperationsInput | string
    playerId?: StringFieldUpdateOperationsInput | string
    statType?: StringFieldUpdateOperationsInput | string
    period?: NullableStringFieldUpdateOperationsInput | string | null
    statisticsJson?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use GameCountOutputTypeDefaultArgs instead
     */
    export type GameCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = GameCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use PlayerCountOutputTypeDefaultArgs instead
     */
    export type PlayerCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PlayerCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CharacterCountOutputTypeDefaultArgs instead
     */
    export type CharacterCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CharacterCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MapCountOutputTypeDefaultArgs instead
     */
    export type MapCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MapCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use GameModeCountOutputTypeDefaultArgs instead
     */
    export type GameModeCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = GameModeCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MatchCountOutputTypeDefaultArgs instead
     */
    export type MatchCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MatchCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use GameDefaultArgs instead
     */
    export type GameArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = GameDefaultArgs<ExtArgs>
    /**
     * @deprecated Use PlayerDefaultArgs instead
     */
    export type PlayerArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PlayerDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CharacterDefaultArgs instead
     */
    export type CharacterArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CharacterDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MapDefaultArgs instead
     */
    export type MapArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MapDefaultArgs<ExtArgs>
    /**
     * @deprecated Use GameModeDefaultArgs instead
     */
    export type GameModeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = GameModeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MatchDefaultArgs instead
     */
    export type MatchArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MatchDefaultArgs<ExtArgs>
    /**
     * @deprecated Use MatchResultDefaultArgs instead
     */
    export type MatchResultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = MatchResultDefaultArgs<ExtArgs>
    /**
     * @deprecated Use PlayerStatsDefaultArgs instead
     */
    export type PlayerStatsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = PlayerStatsDefaultArgs<ExtArgs>
    /**
     * @deprecated Use JobQueueDefaultArgs instead
     */
    export type JobQueueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = JobQueueDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}