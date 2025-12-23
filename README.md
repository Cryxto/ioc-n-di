# @cryxto/ioc-n-di

A lightweight, type-safe TypeScript IoC (Inversion of Control) container and dependency injection library with decorator support.

## Features

- **Type-safe dependency injection** using TypeScript decorators
- **Multiple provider types**: Class, Value, and Factory providers
- **Provider grouping** with `@Group()` decorator for organizing related providers
- **NestJS-style bootstrapping** for easy application initialization
- **Injectable metadata** for storing custom service information
- **Lazy injection** support for circular dependencies
- **Automatic dependency resolution** with circular dependency detection
- **Lifecycle hooks** with `onInit` callbacks
- **Dependency graph visualization** for debugging
- **Smart resolution ordering** based on dependency weights
- **Singleton pattern** - all resolved instances are cached

## Installation

```bash
npm install @cryxto/ioc-n-di reflect-metadata
```

or with bun:

```bash
bun add @cryxto/ioc-n-di reflect-metadata
```

**Important**: This library requires `reflect-metadata` as a peer dependency.

## TypeScript Configuration

Add these settings to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Quick Start

```typescript
import 'reflect-metadata';
import { Container, Injectable } from '@cryxto/ioc-n-di';

@Injectable()
class Logger {
  log(message: string) {
    console.log(`[LOG]: ${message}`);
  }
}

@Injectable()
class UserService {
  constructor(private logger: Logger) {}

  getUser(id: number) {
    this.logger.log(`Fetching user ${id}`);
    return { id, name: 'John Doe' };
  }
}

// Bootstrap
const container = Container.createOrGet();
container.register(Logger);
container.register(UserService);

const userService = await container.resolve(UserService);
const user = userService.getUser(1);
// Output: [LOG]: Fetching user 1
```

## Usage Examples

### Basic Dependency Injection

```typescript
import 'reflect-metadata';
import { Container, Injectable } from '@cryxto/ioc-n-di';

@Injectable()
class Database {
  connect() {
    console.log('Connected to database');
  }
}

@Injectable()
class UserRepository {
  constructor(private db: Database) {}

  findAll() {
    this.db.connect();
    return ['user1', 'user2'];
  }
}

const container = Container.createOrGet();
container.register(Database);
container.register(UserRepository);

const repo = await container.resolve(UserRepository);
repo.findAll();
```

### Token-Based Injection

Use tokens when you need to inject interfaces or specific implementations:

```typescript
import { Container, Injectable, Inject } from '@cryxto/ioc-n-di';

// Define tokens
const DATABASE_URL = Symbol('DATABASE_URL');
const API_KEY = Symbol('API_KEY');

@Injectable()
class ApiService {
  constructor(
    @Inject(DATABASE_URL) private dbUrl: string,
    @Inject(API_KEY) private apiKey: string,
  ) {}

  connect() {
    console.log(`Connecting to ${this.dbUrl} with key ${this.apiKey}`);
  }
}

const container = Container.createOrGet();

// Register value providers
container.register({
  provide: DATABASE_URL,
  useValue: 'postgresql://localhost:5432/mydb',
});

container.register({
  provide: API_KEY,
  useValue: 'secret-key-123',
});

container.register(ApiService);

const service = await container.resolve(ApiService);
service.connect();
// Output: Connecting to postgresql://localhost:5432/mydb with key secret-key-123
```

### Factory Providers

Create instances using factory functions:

```typescript
import { Container } from '@cryxto/ioc-n-di';

const CONFIG_TOKEN = Symbol('CONFIG');
const HTTP_CLIENT = Symbol('HTTP_CLIENT');

container.register({
  provide: CONFIG_TOKEN,
  useValue: { baseUrl: 'https://api.example.com', timeout: 5000 },
});

container.register({
  provide: HTTP_CLIENT,
  useFactory: (config) => {
    return {
      get: (url: string) => fetch(`${config.baseUrl}${url}`),
      timeout: config.timeout,
    };
  },
  deps: [CONFIG_TOKEN],
});

const httpClient = await container.resolve(HTTP_CLIENT);
```

### Lazy Injection (Circular Dependencies)

Handle circular dependencies using lazy references:

```typescript
import { Container, Injectable, Lazy, LazyRef } from '@cryxto/ioc-n-di';

@Injectable()
class ServiceA {
  constructor(@Lazy(ServiceB) private serviceB: LazyRef<ServiceB>) {}

  doSomething() {
    console.log('ServiceA doing something');
    // Access ServiceB lazily when needed
    this.serviceB.value.doSomethingElse();
  }
}

@Injectable()
class ServiceB {
  constructor(@Lazy(ServiceA) private serviceA: LazyRef<ServiceA>) {}

  doSomethingElse() {
    console.log('ServiceB doing something else');
  }
}

const container = Container.createOrGet();
container.register(ServiceA);
container.register(ServiceB);

const serviceA = await container.resolve(ServiceA);
serviceA.doSomething();
// Output:
// ServiceA doing something
// ServiceB doing something else
```

### Lifecycle Hooks

Execute initialization logic after instantiation:

```typescript
import { Container } from '@cryxto/ioc-n-di';

class DatabaseConnection {
  isConnected = false;

  async connect() {
    console.log('Connecting to database...');
    this.isConnected = true;
  }
}

container.register({
  provide: DatabaseConnection,
  useClass: DatabaseConnection,
  onInit: async (instance) => {
    await instance.connect();
    console.log('Database initialized');
  },
});

const db = await container.resolve(DatabaseConnection);
console.log(db.isConnected); // true
```

### NestJS-Style Bootstrapping (Recommended)

The easiest way to initialize your application - register and resolve all providers at once:

```typescript
import { Container, Injectable } from '@cryxto/ioc-n-di';

@Injectable()
class ConfigService {
  getPort() { return 3000; }
}

@Injectable()
class DatabaseService {
  constructor(private config: ConfigService) {}

  async connect() {
    console.log('Database connected');
  }
}

@Injectable()
class AppService {
  constructor(
    private config: ConfigService,
    private db: DatabaseService,
  ) {}
}

// Bootstrap everything at once
const container = await Container.createOrGet().bootstrap([
  ConfigService,
  DatabaseService,
  AppService,
  // You can also mix in value and factory providers
  { provide: 'API_KEY', useValue: 'secret-key' }
]);

// All services are now initialized and ready to use
const app = container.getInstanceOrThrow(AppService);
```

Alternative syntax with configuration object:

```typescript
await container.bootstrap({
  providers: [ConfigService, DatabaseService, AppService]
});
```

### Injectable Metadata

Store custom metadata with your services (useful for plugins, documentation, etc.):

```typescript
import { Injectable, getInjectableMetadata } from '@cryxto/ioc-n-di';

@Injectable({
  metadata: {
    role: 'service',
    layer: 'data',
    version: '1.0.0'
  }
})
class UserService {}

// Retrieve metadata at runtime
const metadata = getInjectableMetadata(UserService);
console.log(metadata?.metadata); // { role: 'service', layer: 'data', version: '1.0.0' }
console.log(metadata?.scope);    // 'singleton'
```

### Resolve All Dependencies

Manually resolve all registered providers in optimal order:

```typescript
import { Container, Injectable } from '@cryxto/ioc-n-di';

@Injectable()
class ConfigService {}

@Injectable()
class LoggerService {
  constructor(private config: ConfigService) {}
}

@Injectable()
class DatabaseService {
  constructor(private logger: LoggerService) {}
}

@Injectable()
class AppService {
  constructor(
    private config: ConfigService,
    private logger: LoggerService,
    private db: DatabaseService,
  ) {}
}

const container = Container.createOrGet();
container.register(ConfigService);
container.register(LoggerService);
container.register(DatabaseService);
container.register(AppService);

// Resolve all in optimal order (based on dependency weights)
await container.resolveAll();

// All services are now cached and ready to use
const app = container.getInstance(AppService);
```

### Provider Groups

Organize related providers into reusable modules using the `@Group()` decorator:

```typescript
import { Group, Injectable, Container } from '@cryxto/ioc-n-di';

// Define your services
@Injectable()
class UserRepository {}

@Injectable()
class UserService {
  constructor(private repo: UserRepository) {}
}

@Injectable()
class UserController {
  constructor(private service: UserService) {}
}

// Group them together
@Group({
  providers: [UserRepository, UserService, UserController]
})
class UserModule {}

// Use in bootstrap - the group is automatically flattened
await container.bootstrap([
  UserModule,  // Expands to UserRepository, UserService, UserController
  AppService
]);
```

#### Groups with Non-Class Providers

Groups can contain any provider type (classes, values, factories):

```typescript
import { MikroORM, EntityManager } from '@mikro-orm/core';

// Factory provider for ORM
const MikroORMProvider = {
  provide: MikroORM,
  useFactory: async (config) => await MikroORM.init(config),
  deps: [ConfigService]
};

// Factory provider for EntityManager
const EntityManagerProvider = {
  provide: EntityManager,
  useFactory: (orm: MikroORM) => orm.em,
  deps: [MikroORM]
};

// Group any provider types together
@Group({
  providers: [
    ConfigService,           // Class
    MikroORMProvider,       // Factory provider
    EntityManagerProvider   // Factory provider
  ]
})
class DatabaseModule {}
```

#### Nested Groups

Groups can contain other groups for hierarchical organization:

```typescript
@Group({
  providers: [ConfigService, LoggerService]
})
class CoreModule {}

@Group({
  providers: [UserRepository, UserService]
})
class UserModule {}

@Group({
  providers: [CoreModule, UserModule, AppService]
})
class AppModule {}

// All groups are recursively flattened
await container.bootstrap([AppModule]);
```

#### Groups for Resolution Ordering

Use groups in `deps` to control resolution order without injecting them:

```typescript
@Group({
  providers: [
    InvitationController,
    UserController,
    AuthController
  ]
})
class ControllersModule {}

// Barrier pattern - ensures all controllers resolve first
const CONTROLLERS_READY = Symbol('CONTROLLERS_READY');
container.register({
  provide: CONTROLLERS_READY,
  useValue: true,
  deps: [ControllersModule]  // ControllersModule providers resolve first
});

// App waits for all controllers to be ready
const AppProvider = {
  provide: APP,
  useFactory: async (apiServer) => createApp(apiServer),
  deps: [API_SERVER, CONTROLLERS_READY]  // Correct ordering guaranteed
};
```

#### Manual Weight Control

Add explicit dependencies to control resolution order:

```typescript
// ClassProvider with explicit deps for weight calculation
container.register({
  provide: AppService,
  useClass: AppService,
  deps: [DatabaseModule, CacheModule]  // These resolve first, even if not injected
});

// FactoryProvider deps also affect weight
container.register({
  provide: API_SERVER,
  useFactory: () => createServer(),
  deps: [ControllersModule]  // All controllers resolve before server
});

// Groups in deps are automatically flattened
@Group({
  providers: [ServiceA, ServiceB],
  deps: [ConfigService]  // Group itself can have dependencies
})
class FeatureModule {}
```

## API Reference

### Container

The main DI container (singleton pattern).

#### Methods

- `static createOrGet(): Container` - Get or create the singleton container instance
- `static getContainer(): Container` - **Deprecated:** Use `createOrGet()` instead
- `register<T>(provider: Provider<T>): void` - Register a provider
- `resolve<T>(token: InjectionToken<T> | Constructor<T>): Promise<T>` - Resolve and return an instance
- `bootstrap(providers: Provider[] | { providers: Provider[] }): Promise<this>` - **New:** Register and resolve all providers at once (NestJS-style)
- `getInstance<T>(token: InjectionToken<T> | Constructor<T>): T | undefined` - Get cached instance synchronously
- `getInstanceOrThrow<T>(token: InjectionToken<T> | Constructor<T>): T` - Get cached instance or throw
- `resolveAll(): Promise<Map>` - Resolve all registered providers in optimal order
- `clear(): void` - Clear all providers and instances (useful for testing)
- `getDependencyGraph(): Map` - Get dependency graph for visualization
- `calculateWeight(token): number` - Calculate dependency weight for a token

### Decorators

- `@Injectable(options?)` - Mark a class as injectable with optional metadata
  - Options: `{ scope?: 'singleton', metadata?: Record<string, unknown> }`
- `@Inject(token)` - Specify injection token for a constructor parameter
- `@Lazy(token)` - Inject a lazy reference to handle circular dependencies
- `@Group(options)` - **New:** Group related providers together into a module
  - Options: `{ providers?: Provider[], deps?: InjectionToken[] }`

### Utility Functions

- `getInjectableMetadata(constructor)` - Retrieve metadata stored by `@Injectable()` decorator
- `getGroupMetadata(constructor)` - **New:** Retrieve metadata stored by `@Group()` decorator
- `isGroup(target)` - **New:** Check if a class is decorated with `@Group()`

### Provider Types

```typescript
// Class Provider
{
  provide: InjectionToken,
  useClass: Constructor,
  deps?: InjectionToken[],  // Optional: for weight calculation and ordering
  onInit?: (instance) => void | Promise<void>
}

// Value Provider
{
  provide: InjectionToken,
  useValue: any
}

// Factory Provider
{
  provide: InjectionToken,
  useFactory: (...args) => any,
  deps?: InjectionToken[],  // Dependencies injected into factory + affects weight
  onInit?: (instance) => void | Promise<void>
}

// Group (created with @Group decorator)
@Group({
  providers?: Provider[],    // Providers to group together
  deps?: InjectionToken[]   // Dependencies for weight calculation
})
class ModuleName {}

// Or just a plain Constructor
Constructor
```

### LazyRef

Wrapper for lazy dependency injection.

#### Methods

- `get value(): T` - Get the resolved instance (throws if not resolved)
- `get(): T` - Same as `value`
- `tryGetValue(): T | undefined` - Try to get the instance without throwing
- `isResolved(): boolean` - Check if the instance has been resolved
- `reset(): void` - Clear the cached instance (for testing)

## Advanced Features

### Dependency Visualization

```typescript
const graph = container.getDependencyGraph();

for (const [service, info] of graph.entries()) {
  console.log(`${service} (weight: ${info.weight})`);
  console.log(`  depends on: ${info.dependencies.join(', ')}`);
}
```

### Custom Tokens

```typescript
// String tokens
container.register({
  provide: 'API_URL',
  useValue: 'https://api.example.com',
});

// Symbol tokens (recommended)
const API_URL = Symbol('API_URL');
container.register({
  provide: API_URL,
  useValue: 'https://api.example.com',
});
```

### Testing

```typescript
import { Container } from '@cryxto/ioc-n-di';

describe('MyService', () => {
  let container: Container;

  beforeEach(() => {
    container = Container.createOrGet();
    container.clear(); // Clear between tests
  });

  it('should inject dependencies', async () => {
    container.register(MockDatabase);
    container.register(MyService);

    const service = await container.resolve(MyService);
    expect(service).toBeDefined();
  });
});
```

## How It Works

1. **Registration**: Register classes, values, or factories with the container
2. **Resolution**: The container analyzes constructor parameters using TypeScript metadata
3. **Dependency Graph**: Builds a dependency graph and calculates optimal resolution order
4. **Instantiation**: Creates instances in the correct order, injecting dependencies
5. **Caching**: All instances are cached as singletons
6. **Lifecycle**: Calls `onInit` hooks after instantiation if provided

## Circular Dependencies

The container detects circular dependencies and throws an error by default. Use `@Lazy()` decorator to break circular chains:

```typescript
// ❌ This will throw an error
@Injectable()
class A {
  constructor(private b: B) {}
}

@Injectable()
class B {
  constructor(private a: A) {} // Circular!
}

// ✅ This works
@Injectable()
class A {
  constructor(@Lazy(B) private b: LazyRef<B>) {}
}

@Injectable()
class B {
  constructor(@Lazy(A) private a: LazyRef<A>) {}
}
```

## Migration from Other DI Libraries

### From InversifyJS

```typescript
// InversifyJS
@injectable()
class MyService {
  constructor(@inject(TYPES.Database) private db: Database) {}
}

// ioc-n-di
@Injectable()
class MyService {
  constructor(@Inject(TYPES.Database) private db: Database) {}
}
```

### From NestJS

The API is very similar to NestJS:

```typescript
// Both work the same way
@Injectable()
class MyService {
  constructor(private readonly logger: Logger) {}
}
```

## License

MIT

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.
