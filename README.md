# ioc-n-di

A lightweight, type-safe TypeScript IoC (Inversion of Control) container and dependency injection library with decorator support.

## Features

- **Type-safe dependency injection** using TypeScript decorators
- **Multiple provider types**: Class, Value, and Factory providers
- **Lazy injection** support for circular dependencies
- **Automatic dependency resolution** with circular dependency detection
- **Lifecycle hooks** with `onInit` callbacks
- **Dependency graph visualization** for debugging
- **Smart resolution ordering** based on dependency weights
- **Singleton pattern** - all resolved instances are cached

## Installation

```bash
npm install ioc-n-di reflect-metadata
```

or with bun:

```bash
bun add ioc-n-di reflect-metadata
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
import { Container, Injectable } from 'ioc-n-di';

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
const container = Container.getContainer();
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
import { Container, Injectable } from 'ioc-n-di';

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

const container = Container.getContainer();
container.register(Database);
container.register(UserRepository);

const repo = await container.resolve(UserRepository);
repo.findAll();
```

### Token-Based Injection

Use tokens when you need to inject interfaces or specific implementations:

```typescript
import { Container, Injectable, Inject } from 'ioc-n-di';

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

const container = Container.getContainer();

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
import { Container } from 'ioc-n-di';

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
import { Container, Injectable, Lazy, LazyRef } from 'ioc-n-di';

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

const container = Container.getContainer();
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
import { Container } from 'ioc-n-di';

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

### Resolve All Dependencies

Bootstrap your entire application at once:

```typescript
import { Container, Injectable } from 'ioc-n-di';

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

const container = Container.getContainer();
container.register(ConfigService);
container.register(LoggerService);
container.register(DatabaseService);
container.register(AppService);

// Resolve all in optimal order (based on dependency weights)
await container.resolveAll();

// All services are now cached and ready to use
const app = container.getInstance(AppService);
```

## API Reference

### Container

The main DI container (singleton pattern).

#### Methods

- `static getContainer(): Container` - Get the singleton container instance
- `register<T>(provider: Provider<T>): void` - Register a provider
- `resolve<T>(token: InjectionToken<T> | Constructor<T>): Promise<T>` - Resolve and return an instance
- `getInstance<T>(token: InjectionToken<T> | Constructor<T>): T | undefined` - Get cached instance synchronously
- `getInstanceOrThrow<T>(token: InjectionToken<T> | Constructor<T>): T` - Get cached instance or throw
- `resolveAll(): Promise<Map>` - Resolve all registered providers in optimal order
- `clear(): void` - Clear all providers and instances (useful for testing)
- `getDependencyGraph(): Map` - Get dependency graph for visualization
- `calculateWeight(token): number` - Calculate dependency weight for a token

### Decorators

- `@Injectable()` - Mark a class as injectable
- `@Inject(token)` - Specify injection token for a constructor parameter
- `@Lazy(token)` - Inject a lazy reference to handle circular dependencies

### Provider Types

```typescript
// Class Provider
{
  provide: InjectionToken,
  useClass: Constructor,
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
  deps?: InjectionToken[],
  onInit?: (instance) => void | Promise<void>
}

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
import { Container } from 'ioc-n-di';

describe('MyService', () => {
  let container: Container;

  beforeEach(() => {
    container = Container.getContainer();
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
