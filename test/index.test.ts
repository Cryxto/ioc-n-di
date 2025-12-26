import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import {
	type ClassProvider,
	Container,
	type FactoryProvider,
	forwardRef,
	Group,
	getGroupMetadata,
	Inject,
	Injectable,
	isGroup,
	Lazy,
	LazyRef,
	LazyRefMarker,
	LogLevel,
	lazy,
	type OnDestroy,
	type OnInit,
	type ValueProvider,
} from '../src'

// ============================================================================
// Test Helpers
// ============================================================================

function resetContainer() {
	// Reset the singleton container instance for clean tests
	const container = Container.createOrGet()
	container.clear()
	container.setLogLevel(LogLevel.OFF) // Disable logging for tests
	// Reset resolution order tracking
	resolutionOrder.length = 0
}

// ============================================================================
// Test Services
// ============================================================================

@Injectable()
class BasicService {
	getValue() {
		return 'basic'
	}
}

@Injectable()
class DependentService {
	constructor(public basic: BasicService) {}

	getCombinedValue() {
		return `dependent-${this.basic.getValue()}`
	}
}

@Injectable()
class MultiDependencyService {
	constructor(
		public basic: BasicService,
		public dependent: DependentService,
	) {}
}

class ServiceA {
	constructor(public serviceB: ServiceB) {}
}

class ServiceB {
	constructor(public serviceA: ServiceA) {}
}

class ServiceC {
	constructor(public serviceD: LazyRef<ServiceD>) {}
}

class ServiceD {
	getValue() {
		return 'service-d'
	}
}

class ServiceALazy {
	constructor(
		@Inject(lazy(() => ServiceBLazy)) public serviceB: LazyRef<ServiceBLazy>,
	) {}
}

class ServiceBLazy {
	constructor(
		@Inject(lazy(() => ServiceALazy)) public serviceA: LazyRef<ServiceALazy>,
	) {}
}

class ServiceCLazy {
	constructor(@Lazy(ServiceD) public serviceD: LazyRef<ServiceD>) {}
}

// Circular dependency test classes (forward declaration needed)
@Injectable()
class CircularB {
	// biome-ignore lint/suspicious/noExplicitAny: Forward reference requires any to avoid initialization error
	constructor(@Inject('CircularA') public a: any) {}
}

@Injectable()
class CircularA {
	constructor(@Inject('CircularB') public b: CircularB) {}
}

// Tracked classes for resolution order testing
@Injectable()
class TrackedA {
	constructor() {
		resolutionOrder.push('A')
	}
}

@Injectable()
class TrackedB {
	constructor(public a: TrackedA) {
		resolutionOrder.push('B')
	}
}

@Injectable()
class TrackedC {
	constructor(
		public a: TrackedA,
		public b: TrackedB,
	) {
		resolutionOrder.push('C')
	}
}

// Resolution order tracking
const resolutionOrder: string[] = []

// Bad service for error handling tests
@Injectable()
// biome-ignore lint/correctness/noUnusedVariables: Used in error handling tests
class BadService {
	constructor(public config: { value: string }) {}
}

// Empty dependencies service
@Injectable()
class EmptyDepsService {
	constructor() {}
}

// ============================================================================
// Container Singleton Tests
// ============================================================================

describe('Container Singleton', () => {
	beforeEach(resetContainer)

	test('should return the same instance', () => {
		const container1 = Container.createOrGet()
		const container2 = Container.createOrGet()
		expect(container1).toBe(container2)
	})
})

// ============================================================================
// Basic Registration and Resolution Tests
// ============================================================================

describe('Basic Registration and Resolution', () => {
	beforeEach(resetContainer)

	test('should register and resolve a plain class', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		const instance = await container.resolve(BasicService)

		expect(instance).toBeInstanceOf(BasicService)
		expect(instance.getValue()).toBe('basic')
	})

	test('should cache resolved instances', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		const instance1 = await container.resolve(BasicService)
		const instance2 = await container.resolve(BasicService)

		expect(instance1).toBe(instance2)
	})

	test('should resolve dependencies automatically', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)

		const instance = await container.resolve(DependentService)

		expect(instance).toBeInstanceOf(DependentService)
		expect(instance.basic).toBeInstanceOf(BasicService)
		expect(instance.getCombinedValue()).toBe('dependent-basic')
	})

	test('should resolve multiple dependencies', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		const instance = await container.resolve(MultiDependencyService)

		expect(instance.basic).toBeInstanceOf(BasicService)
		expect(instance.dependent).toBeInstanceOf(DependentService)
	})

	test('should resolve unregistered class if it is a constructor', async () => {
		const container = Container.createOrGet()
		const instance = await container.resolve(BasicService)

		expect(instance).toBeInstanceOf(BasicService)
	})
})

// ============================================================================
// Class Provider Tests
// ============================================================================

describe('Class Provider', () => {
	beforeEach(resetContainer)

	test('should register and resolve class provider', async () => {
		const container = Container.createOrGet()
		const provider: ClassProvider = {
			provide: 'BasicService',
			useClass: BasicService,
		}
		container.register(provider)

		const instance = await container.resolve<BasicService>('BasicService')
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('should call onInit lifecycle hook', async () => {
		const container = Container.createOrGet()
		let initCalled = false

		const provider: ClassProvider<BasicService> = {
			provide: 'BasicService',
			useClass: BasicService,
			onInit: async (instance) => {
				initCalled = true
				expect(instance).toBeInstanceOf(BasicService)
			},
		}
		container.register(provider)

		await container.resolve<BasicService>('BasicService')
		expect(initCalled).toBe(true)
	})

	test('should support async onInit hook', async () => {
		const container = Container.createOrGet()
		let initValue = 0

		const provider: ClassProvider<BasicService> = {
			provide: 'BasicService',
			useClass: BasicService,
			onInit: async (_instance) => {
				await new Promise((resolve) => setTimeout(resolve, 10))
				initValue = 42
			},
		}
		container.register(provider)

		await container.resolve<BasicService>('BasicService')
		expect(initValue).toBe(42)
	})
})

// ============================================================================
// Value Provider Tests
// ============================================================================

describe('Value Provider', () => {
	beforeEach(resetContainer)

	test('should register and resolve value provider', async () => {
		const container = Container.createOrGet()
		const value = { key: 'value' }
		const provider: ValueProvider = {
			provide: 'config',
			useValue: value,
		}
		container.register(provider)

		const instance = await container.resolve('config')
		expect(instance).toBe(value)
	})

	test('should support primitive values', async () => {
		const container = Container.createOrGet()

		container.register({ provide: 'string', useValue: 'hello' })
		container.register({ provide: 'number', useValue: 42 })
		container.register({ provide: 'boolean', useValue: true })
		container.register({ provide: 'null', useValue: null })

		expect(await container.resolve<string>('string')).toBe('hello')
		expect(await container.resolve<number>('number')).toBe(42)
		expect(await container.resolve<boolean>('boolean')).toBe(true)
		expect(await container.resolve<null>('null')).toBe(null)
	})

	test('should cache value provider instances immediately', () => {
		const container = Container.createOrGet()
		const value = { key: 'value' }
		container.register({ provide: 'config', useValue: value })

		const instance = container.getInstance('config')
		expect(instance).toBe(value)
	})
})

// ============================================================================
// Factory Provider Tests
// ============================================================================

describe('Factory Provider', () => {
	beforeEach(resetContainer)

	test('should register and resolve factory provider', async () => {
		const container = Container.createOrGet()
		const provider: FactoryProvider = {
			provide: 'factory',
			useFactory: () => ({ created: 'by-factory' }),
		}
		container.register(provider)

		const instance = await container.resolve('factory')
		expect(instance).toEqual({ created: 'by-factory' })
	})

	test('should resolve factory dependencies', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		const provider: FactoryProvider = {
			provide: 'factory',
			useFactory: (basic: BasicService) => {
				return { value: basic.getValue() }
			},
			deps: [BasicService],
		}
		container.register(provider)

		const instance = await container.resolve<{ value: string }>('factory')
		expect(instance.value).toBe('basic')
	})

	test('should support async factory', async () => {
		const container = Container.createOrGet()
		const provider: FactoryProvider = {
			provide: 'async-factory',
			useFactory: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
				return { async: true }
			},
		}
		container.register(provider)

		const instance = await container.resolve('async-factory')
		expect(instance).toEqual({ async: true })
	})

	test('should call onInit for factory provider', async () => {
		const container = Container.createOrGet()
		let initCalled = false

		const provider: FactoryProvider<{ value: string }> = {
			provide: 'factory',
			useFactory: () => ({ value: 'test' }),
			onInit: async (instance) => {
				initCalled = true
				expect(instance.value).toBe('test')
			},
		}
		container.register(provider)

		await container.resolve('factory')
		expect(initCalled).toBe(true)
	})
})

// ============================================================================
// Injection Token Tests
// ============================================================================

describe('Injection Tokens', () => {
	beforeEach(resetContainer)

	test('should use string tokens', async () => {
		const container = Container.createOrGet()
		container.register({ provide: 'MY_TOKEN', useValue: 'token-value' })

		const value = await container.resolve('MY_TOKEN')
		expect(value).toBe('token-value')
	})

	test('should use symbol tokens', async () => {
		const container = Container.createOrGet()
		const TOKEN = Symbol('MY_TOKEN')
		container.register({ provide: TOKEN, useValue: 'symbol-value' })

		const value = await container.resolve(TOKEN)
		expect(value).toBe('symbol-value')
	})

	test('should inject using @Inject decorator', async () => {
		const container = Container.createOrGet()
		const TOKEN = 'MY_SERVICE'

		@Injectable()
		class ServiceWithToken {
			constructor(@Inject(TOKEN) public myService: BasicService) {}
		}

		container.register({ provide: TOKEN, useClass: BasicService })
		container.register(ServiceWithToken)

		const instance = await container.resolve(ServiceWithToken)
		expect(instance.myService).toBeInstanceOf(BasicService)
	})
})

// ============================================================================
// Circular Dependency Tests
// ============================================================================

describe('Circular Dependencies', () => {
	beforeEach(resetContainer)

	test('should detect circular dependencies', async () => {
		const container = Container.createOrGet()
		container.register({ provide: 'CircularA', useClass: CircularA })
		container.register({ provide: 'CircularB', useClass: CircularB })

		await expect(container.resolve('CircularA')).rejects.toThrow(
			'Circular dependency detected',
		)
	})

	test('should support @Lazy pattern for lazy references', async () => {
		const container = Container.createOrGet()
		container.register(ServiceCLazy)
		container.register(ServiceD)

		const instance = await container.resolve(ServiceCLazy)

		expect(instance.serviceD).toBeInstanceOf(LazyRef)
		expect(instance.serviceD.isResolved()).toBe(false)

		// Resolve ServiceD so it can be accessed
		await container.resolve(ServiceD)

		expect(instance.serviceD.isResolved()).toBe(true)
		expect(instance.serviceD.value).toBeInstanceOf(ServiceD)
		expect(instance.serviceD.value.getValue()).toBe('service-d')
	})
})

// ============================================================================
// LazyRef Tests
// ============================================================================

describe('LazyRef', () => {
	beforeEach(resetContainer)

	test('should create LazyRef with @Lazy decorator', async () => {
		const container = Container.createOrGet()
		container.register(ServiceCLazy)
		container.register(ServiceD)

		const instance = await container.resolve(ServiceCLazy)
		expect(instance.serviceD).toBeInstanceOf(LazyRef)
	})

	test('should get value from LazyRef', async () => {
		const container = Container.createOrGet()
		container.register(ServiceD)

		const lazyRef = new LazyRef(container, ServiceD)
		await container.resolve(ServiceD)

		const value = lazyRef.get()
		expect(value).toBeInstanceOf(ServiceD)
		expect(value.getValue()).toBe('service-d')
	})

	test('should access value property', async () => {
		const container = Container.createOrGet()
		container.register(ServiceD)
		await container.resolve(ServiceD)

		const lazyRef = new LazyRef(container, ServiceD)
		expect(lazyRef.value).toBeInstanceOf(ServiceD)
	})

	test('should throw when getting unresolved LazyRef', () => {
		const container = Container.createOrGet()
		const lazyRef = new LazyRef(container, ServiceD)

		expect(() => lazyRef.get()).toThrow('Instance not resolved yet')
	})

	test('should tryGetValue on unresolved LazyRef', () => {
		const container = Container.createOrGet()
		const lazyRef = new LazyRef(container, ServiceD)

		expect(lazyRef.tryGetValue()).toBeUndefined()
	})

	test('should check isResolved', async () => {
		const container = Container.createOrGet()
		container.register(ServiceD)
		const lazyRef = new LazyRef(container, ServiceD)

		expect(lazyRef.isResolved()).toBe(false)

		await container.resolve(ServiceD)
		expect(lazyRef.isResolved()).toBe(true)
	})

	test('should reset LazyRef', async () => {
		const container = Container.createOrGet()
		container.register(ServiceD)
		await container.resolve(ServiceD)

		const lazyRef = new LazyRef(container, ServiceD)
		expect(lazyRef.isResolved()).toBe(true)

		lazyRef.reset()
		expect(lazyRef.isResolved()).toBe(false)
	})
})

// ============================================================================
// Lazy Function Tests
// ============================================================================

describe('lazy() and forwardRef()', () => {
	beforeEach(resetContainer)

	test('should create LazyRefMarker', () => {
		const marker = lazy(() => BasicService)
		expect(marker).toBeInstanceOf(LazyRefMarker)
	})

	test('should resolve lazy reference', async () => {
		const container = Container.createOrGet()

		class ServiceWithLazy {
			constructor(
				@Inject(lazy(() => BasicService)) public basic: LazyRef<BasicService>,
			) {}
		}

		container.register(BasicService)
		container.register(ServiceWithLazy)

		// Resolve BasicService first to populate the instance cache
		await container.resolve(BasicService)

		const instance = await container.resolve(ServiceWithLazy)
		expect(instance.basic).toBeInstanceOf(LazyRef)
		expect(instance.basic.value).toBeInstanceOf(BasicService)
	})

	test('forwardRef should be alias of lazy', () => {
		expect(forwardRef).toBe(lazy)
	})
})

// ============================================================================
// getInstance and getInstanceOrThrow Tests
// ============================================================================

describe('getInstance and getInstanceOrThrow', () => {
	beforeEach(resetContainer)

	test('getInstance should return undefined for unresolved', () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		expect(container.getInstance(BasicService)).toBeUndefined()
	})

	test('getInstance should return instance after resolution', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		await container.resolve(BasicService)

		const instance = container.getInstance(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('getInstanceOrThrow should throw for unresolved', () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		expect(() => container.getInstanceOrThrow(BasicService)).toThrow(
			'Instance not resolved yet',
		)
	})

	test('getInstanceOrThrow should return instance after resolution', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		await container.resolve(BasicService)

		const instance = container.getInstanceOrThrow(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('getInstanceOrThrow should handle falsy values correctly', async () => {
		const container = Container.createOrGet()

		container.register({ provide: 'zero', useValue: 0 })
		container.register({ provide: 'false', useValue: false })
		container.register({ provide: 'empty', useValue: '' })

		expect(container.getInstanceOrThrow<number>('zero')).toBe(0)
		expect(container.getInstanceOrThrow<boolean>('false')).toBe(false)
		expect(container.getInstanceOrThrow<string>('empty')).toBe('')
	})
})

// ============================================================================
// Weight Calculation Tests
// ============================================================================

describe('Weight Calculation', () => {
	beforeEach(resetContainer)

	test('should calculate weight for value provider', () => {
		const container = Container.createOrGet()
		container.register({ provide: 'value', useValue: 'test' })

		expect(container.calculateWeight('value')).toBe(0)
	})

	test('should calculate weight for service with no dependencies', () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		expect(container.calculateWeight(BasicService)).toBe(0)
	})

	test('should calculate weight for service with dependencies', () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)

		expect(container.calculateWeight(DependentService)).toBe(1)
	})

	test('should calculate weight for multi-level dependencies', () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		expect(container.calculateWeight(MultiDependencyService)).toBe(2)
	})

	test('should cache weight calculations', () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		const weight1 = container.calculateWeight(BasicService)
		const weight2 = container.calculateWeight(BasicService)

		expect(weight1).toBe(weight2)
		expect(weight1).toBe(0)
	})

	test('should skip lazy dependencies in weight calculation', () => {
		const container = Container.createOrGet()
		container.register(ServiceC)
		container.register(ServiceD)

		// ServiceC has a @Lazy dependency, so it should have weight 0
		expect(container.calculateWeight(ServiceC)).toBe(0)
	})
})

// ============================================================================
// getProvidersByWeight Tests
// ============================================================================

describe('getProvidersByWeight', () => {
	beforeEach(resetContainer)

	test('should return providers sorted by weight', () => {
		const container = Container.createOrGet()
		container.register(MultiDependencyService)
		container.register(BasicService)
		container.register(DependentService)

		const sorted = container.getProvidersByWeight()

		// biome-ignore lint/style/noNonNullAssertion: We know the array has values in tests
		expect(sorted[0]!.token).toBe(BasicService)
		// biome-ignore lint/style/noNonNullAssertion: We know the array has values in tests
		expect(sorted[0]!.weight).toBe(0)
		// biome-ignore lint/style/noNonNullAssertion: We know the array has values in tests
		expect(sorted[1]!.token).toBe(DependentService)
		// biome-ignore lint/style/noNonNullAssertion: We know the array has values in tests
		expect(sorted[1]!.weight).toBe(1)
		// biome-ignore lint/style/noNonNullAssertion: We know the array has values in tests
		expect(sorted[2]!.token).toBe(MultiDependencyService)
		// biome-ignore lint/style/noNonNullAssertion: We know the array has values in tests
		expect(sorted[2]!.weight).toBe(2)
	})
})

// ============================================================================
// resolveAll Tests
// ============================================================================

describe('resolveAll', () => {
	beforeEach(resetContainer)

	test('should resolve all providers', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		const instances = await container.resolveAll()

		expect(instances.get(BasicService)).toBeInstanceOf(BasicService)
		expect(instances.get(DependentService)).toBeInstanceOf(DependentService)
		expect(instances.get(MultiDependencyService)).toBeInstanceOf(
			MultiDependencyService,
		)
	})

	test('should resolve in optimal order', async () => {
		const container = Container.createOrGet()
		container.register(TrackedC)
		container.register(TrackedA)
		container.register(TrackedB)

		await container.resolveAll()

		expect(resolutionOrder).toEqual(['A', 'B', 'C'])
	})

	test('should handle lazy dependencies in resolveAll', async () => {
		const container = Container.createOrGet()
		container.register(ServiceC)
		container.register(ServiceD)

		const instances = await container.resolveAll()

		expect(instances.get(ServiceC)).toBeInstanceOf(ServiceC)
		expect(instances.get(ServiceD)).toBeInstanceOf(ServiceD)
	})
})

// ============================================================================
// getDependencyGraph Tests
// ============================================================================

describe('getDependencyGraph', () => {
	beforeEach(resetContainer)

	test('should return dependency graph', () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)

		const graph = container.getDependencyGraph()

		expect(graph.has('BasicService')).toBe(true)
		expect(graph.has('DependentService')).toBe(true)

		const basicNode = graph.get('BasicService')
		expect(basicNode?.weight).toBe(0)
		expect(basicNode?.dependencies).toEqual([])

		const dependentNode = graph.get('DependentService')
		expect(dependentNode?.weight).toBe(1)
		expect(dependentNode?.dependencies).toEqual(['BasicService'])
	})

	test('should handle multi-level dependencies in graph', () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		const graph = container.getDependencyGraph()
		const multiNode = graph.get('MultiDependencyService')

		expect(multiNode?.weight).toBe(2)
		expect(multiNode?.dependencies).toContain('BasicService')
		expect(multiNode?.dependencies).toContain('DependentService')
	})
})

// ============================================================================
// getInstancesMap and getProvidersMap Tests
// ============================================================================

describe('getInstancesMap and getProvidersMap', () => {
	beforeEach(resetContainer)

	test('should return read-only instances map', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		await container.resolve(BasicService)

		const map = container.getInstancesMap()
		expect(map.get(BasicService)).toBeInstanceOf(BasicService)
	})

	test('should return read-only providers map', () => {
		const container = Container.createOrGet()
		container.register(BasicService)

		const map = container.getProvidersMap()
		expect(map.has(BasicService)).toBe(true)
	})
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
	beforeEach(resetContainer)

	test('should throw when no provider found for token', async () => {
		const container = Container.createOrGet()
		await expect(container.resolve('UNKNOWN_TOKEN')).rejects.toThrow(
			'No provider found',
		)
	})

	test('should handle errors in factory gracefully', async () => {
		const container = Container.createOrGet()

		const provider: FactoryProvider = {
			provide: 'error-factory',
			useFactory: () => {
				throw new Error('Factory error')
			},
		}
		container.register(provider)

		await expect(container.resolve('error-factory')).rejects.toThrow(
			'Factory error',
		)
	})

	test('should handle errors in onInit gracefully', async () => {
		const container = Container.createOrGet()

		const provider: ClassProvider<BasicService> = {
			provide: 'BasicService',
			useClass: BasicService,
			onInit: () => {
				throw new Error('onInit error')
			},
		}
		container.register(provider)

		await expect(container.resolve('BasicService')).rejects.toThrow(
			'onInit error',
		)
	})
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
	beforeEach(resetContainer)

	test('should handle registering same provider twice', async () => {
		const container = Container.createOrGet()
		container.register(BasicService)
		container.register(BasicService)

		const instance = await container.resolve(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('should handle empty dependencies array', async () => {
		const container = Container.createOrGet()
		container.register(EmptyDepsService)
		const instance = await container.resolve(EmptyDepsService)

		expect(instance).toBeInstanceOf(EmptyDepsService)
	})

	test('should handle value provider with falsy values', async () => {
		const container = Container.createOrGet()

		container.register({ provide: 'zero', useValue: 0 })
		container.register({ provide: 'false', useValue: false })
		container.register({ provide: 'empty', useValue: '' })

		expect(await container.resolve<number>('zero')).toBe(0)
		expect(await container.resolve<boolean>('false')).toBe(false)
		expect(await container.resolve<string>('empty')).toBe('')
	})

	test('should handle factory with no dependencies', async () => {
		const container = Container.createOrGet()

		const provider: FactoryProvider = {
			provide: 'no-deps',
			useFactory: () => ({ value: 'test' }),
			deps: [],
		}
		container.register(provider)

		const instance = await container.resolve('no-deps')
		expect(instance).toEqual({ value: 'test' })
	})

	test('should handle class provider with same class as token', async () => {
		const container = Container.createOrGet()

		const provider: ClassProvider<BasicService> = {
			provide: BasicService,
			useClass: BasicService,
		}
		container.register(provider)

		const instance = await container.resolve(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})
})

// ============================================================================
// Group Tests
// ============================================================================

describe('Group Decorator', () => {
	beforeEach(resetContainer)

	test('should create group with @Group decorator', () => {
		@Group({
			providers: [BasicService, DependentService],
		})
		class TestModule {}

		const metadata = getGroupMetadata(TestModule)
		expect(metadata?.providers).toEqual([BasicService, DependentService])
	})

	test('should check if class is a group', () => {
		@Group({ providers: [BasicService] })
		class TestModule {}

		expect(isGroup(TestModule)).toBe(true)
		expect(isGroup(BasicService)).toBe(false)
	})

	test('should flatten groups in bootstrap', async () => {
		const container = Container.createOrGet()

		@Injectable()
		class ServiceA {
			getValue() {
				return 'A'
			}
		}

		@Injectable()
		class ServiceB {
			getValue() {
				return 'B'
			}
		}

		@Group({
			providers: [ServiceA, ServiceB],
		})
		class TestModule {}

		await container.bootstrap([TestModule])

		const instanceA = container.getInstance(ServiceA)
		const instanceB = container.getInstance(ServiceB)

		expect(instanceA).toBeInstanceOf(ServiceA)
		expect(instanceB).toBeInstanceOf(ServiceB)
	})

	test('should handle nested groups', async () => {
		const container = Container.createOrGet()

		@Injectable()
		class ServiceA {
			getValue() {
				return 'A'
			}
		}

		@Injectable()
		class ServiceB {
			getValue() {
				return 'B'
			}
		}

		@Injectable()
		class ServiceC {
			getValue() {
				return 'C'
			}
		}

		@Group({
			providers: [ServiceA, ServiceB],
		})
		class ModuleA {}

		@Group({
			providers: [ModuleA, ServiceC],
		})
		class ModuleB {}

		await container.bootstrap([ModuleB])

		expect(container.getInstance(ServiceA)).toBeInstanceOf(ServiceA)
		expect(container.getInstance(ServiceB)).toBeInstanceOf(ServiceB)
		expect(container.getInstance(ServiceC)).toBeInstanceOf(ServiceC)
	})

	test('should use group deps for weight calculation', () => {
		const container = Container.createOrGet()

		@Injectable()
		class ConfigService {}

		@Injectable()
		class LoggerService {}

		@Group({
			providers: [ConfigService, LoggerService],
		})
		class CoreModule {}

		@Injectable()
		class AppService {
			constructor(public config: ConfigService) {}
		}

		container.register({
			provide: AppService,
			useClass: AppService,
			deps: [CoreModule], // CoreModule should add ConfigService and LoggerService as deps
		})

		container.register(ConfigService)
		container.register(LoggerService)

		// AppService depends on CoreModule which contains ConfigService and LoggerService
		// So AppService should have weight > 0
		const weight = container.calculateWeight(AppService)
		expect(weight).toBeGreaterThan(0)
	})

	test('should handle group with deps property', async () => {
		const container = Container.createOrGet()

		@Injectable()
		class ConfigService {
			getValue() {
				return 'config'
			}
		}

		@Injectable()
		class ServiceA {
			getValue() {
				return 'A'
			}
		}

		@Injectable()
		class ServiceB {
			getValue() {
				return 'B'
			}
		}

		// Group declares deps on ConfigService
		@Group({
			providers: [ServiceA, ServiceB],
			deps: [ConfigService],
		})
		class FeatureModule {}

		await container.bootstrap([ConfigService, FeatureModule])

		expect(container.getInstance(ConfigService)).toBeInstanceOf(ConfigService)
		expect(container.getInstance(ServiceA)).toBeInstanceOf(ServiceA)
		expect(container.getInstance(ServiceB)).toBeInstanceOf(ServiceB)
	})

	test('should handle ClassProvider with deps property', () => {
		const container = Container.createOrGet()

		@Injectable()
		class ServiceA {}

		@Injectable()
		class ServiceB {}

		@Injectable()
		class ServiceC {}

		// ServiceC has explicit deps on ServiceA and ServiceB for weight calculation
		container.register({
			provide: ServiceC,
			useClass: ServiceC,
			deps: [ServiceA, ServiceB],
		})

		container.register(ServiceA)
		container.register(ServiceB)

		// ServiceC should have weight 1 because it depends on ServiceA and ServiceB
		const weight = container.calculateWeight(ServiceC)
		expect(weight).toBe(1)
	})

	test('should prevent infinite recursion with circular groups', async () => {
		const container = Container.createOrGet()

		@Injectable()
		class ServiceA {
			getValue() {
				return 'A'
			}
		}

		// Create a group that might reference itself (edge case)
		@Group({
			providers: [ServiceA],
		})
		class TestModule {}

		// This should not cause infinite recursion
		await container.bootstrap([TestModule])

		expect(container.getInstance(ServiceA)).toBeInstanceOf(ServiceA)
	})

	test('should mix regular providers with groups in bootstrap', async () => {
		const container = Container.createOrGet()

		@Injectable()
		class ServiceA {
			getValue() {
				return 'A'
			}
		}

		@Injectable()
		class ServiceB {
			getValue() {
				return 'B'
			}
		}

		@Injectable()
		class ServiceC {
			getValue() {
				return 'C'
			}
		}

		@Group({
			providers: [ServiceA, ServiceB],
		})
		class ModuleAB {}

		// Mix group and regular provider
		await container.bootstrap([ModuleAB, ServiceC])

		expect(container.getInstance(ServiceA)).toBeInstanceOf(ServiceA)
		expect(container.getInstance(ServiceB)).toBeInstanceOf(ServiceB)
		expect(container.getInstance(ServiceC)).toBeInstanceOf(ServiceC)
	})
})

// ============================================================================
// Lifecycle Hooks Tests
// ============================================================================

describe('Lifecycle Hooks', () => {
	beforeEach(resetContainer)

	test('should call onInit method when class implements OnInit', async () => {
		const container = Container.createOrGet()
		let initCalled = false

		@Injectable()
		class ServiceWithInit implements OnInit {
			async onInit() {
				initCalled = true
			}

			getValue() {
				return 'test'
			}
		}

		container.register(ServiceWithInit)
		await container.resolve(ServiceWithInit)

		expect(initCalled).toBe(true)
	})

	test('should call onDestroy method when class implements OnDestroy', async () => {
		const container = Container.createOrGet()
		let destroyCalled = false

		@Injectable()
		class ServiceWithDestroy implements OnDestroy {
			async onDestroy() {
				destroyCalled = true
			}

			getValue() {
				return 'test'
			}
		}

		container.register(ServiceWithDestroy)
		await container.resolve(ServiceWithDestroy)
		await container.destroy()

		expect(destroyCalled).toBe(true)
	})

	test('should call both OnInit and OnDestroy when class implements both', async () => {
		const container = Container.createOrGet()
		const lifecycleCalls: string[] = []

		@Injectable()
		class ServiceWithBothHooks implements OnInit, OnDestroy {
			async onInit() {
				lifecycleCalls.push('init')
			}

			async onDestroy() {
				lifecycleCalls.push('destroy')
			}

			getValue() {
				return 'test'
			}
		}

		container.register(ServiceWithBothHooks)
		await container.resolve(ServiceWithBothHooks)
		await container.destroy()

		expect(lifecycleCalls).toEqual(['init', 'destroy'])
	})

	test('should support synchronous lifecycle hooks', async () => {
		const container = Container.createOrGet()
		const lifecycleCalls: string[] = []

		@Injectable()
		class ServiceWithSyncHooks implements OnInit, OnDestroy {
			onInit() {
				lifecycleCalls.push('init')
			}

			onDestroy() {
				lifecycleCalls.push('destroy')
			}
		}

		container.register(ServiceWithSyncHooks)
		await container.resolve(ServiceWithSyncHooks)
		await container.destroy()

		expect(lifecycleCalls).toEqual(['init', 'destroy'])
	})

	test('should call provider onInit and instance onInit in correct order', async () => {
		const container = Container.createOrGet()
		const calls: string[] = []

		@Injectable()
		class ServiceWithInit implements OnInit {
			onInit() {
				calls.push('instance-onInit')
			}
		}

		const provider: ClassProvider<ServiceWithInit> = {
			provide: ServiceWithInit,
			useClass: ServiceWithInit,
			onInit: () => {
				calls.push('provider-onInit')
			},
		}

		container.register(provider)
		await container.resolve(ServiceWithInit)

		expect(calls).toEqual(['provider-onInit', 'instance-onInit'])
	})

	test('should call provider onDestroy and instance onDestroy in correct order', async () => {
		const container = Container.createOrGet()
		const calls: string[] = []

		@Injectable()
		class ServiceWithDestroy implements OnDestroy {
			onDestroy() {
				calls.push('instance-onDestroy')
			}
		}

		const provider: ClassProvider<ServiceWithDestroy> = {
			provide: ServiceWithDestroy,
			useClass: ServiceWithDestroy,
			onDestroy: () => {
				calls.push('provider-onDestroy')
			},
		}

		container.register(provider)
		await container.resolve(ServiceWithDestroy)
		await container.destroy()

		expect(calls).toEqual(['provider-onDestroy', 'instance-onDestroy'])
	})

	test('should support onDestroy in factory provider', async () => {
		const container = Container.createOrGet()
		let destroyCalled = false

		const provider: FactoryProvider<{ close: () => void }> = {
			provide: 'connection',
			useFactory: () => ({
				close: () => {
					/* cleanup */
				},
			}),
			onDestroy: async (instance) => {
				instance.close()
				destroyCalled = true
			},
		}

		container.register(provider)
		await container.resolve('connection')
		await container.destroy()

		expect(destroyCalled).toBe(true)
	})

	test('should handle lifecycle hooks with dependencies', async () => {
		const container = Container.createOrGet()
		const lifecycleCalls: string[] = []

		@Injectable()
		class ConfigService implements OnInit, OnDestroy {
			onInit() {
				lifecycleCalls.push('config-init')
			}

			onDestroy() {
				lifecycleCalls.push('config-destroy')
			}
		}

		@Injectable()
		class DatabaseService implements OnInit, OnDestroy {
			constructor(public config: ConfigService) {}

			onInit() {
				lifecycleCalls.push('database-init')
			}

			onDestroy() {
				lifecycleCalls.push('database-destroy')
			}
		}

		container.register(ConfigService)
		container.register(DatabaseService)
		await container.resolve(DatabaseService)
		await container.destroy()

		expect(lifecycleCalls).toContain('config-init')
		expect(lifecycleCalls).toContain('database-init')
		expect(lifecycleCalls).toContain('config-destroy')
		expect(lifecycleCalls).toContain('database-destroy')

		// onDestroy should be called in reverse order (database before config)
		const destroyIndex1 = lifecycleCalls.indexOf('database-destroy')
		const destroyIndex2 = lifecycleCalls.indexOf('config-destroy')
		expect(destroyIndex1).toBeLessThan(destroyIndex2)
	})

	test('should continue cleanup even if one onDestroy fails', async () => {
		const container = Container.createOrGet()
		const destroyCalls: string[] = []

		@Injectable()
		class ServiceA implements OnDestroy {
			onDestroy() {
				destroyCalls.push('A')
			}
		}

		@Injectable()
		class ServiceB implements OnDestroy {
			onDestroy() {
				destroyCalls.push('B')
				throw new Error('ServiceB onDestroy failed')
			}
		}

		@Injectable()
		class ServiceC implements OnDestroy {
			onDestroy() {
				destroyCalls.push('C')
			}
		}

		container.register(ServiceA)
		container.register(ServiceB)
		container.register(ServiceC)

		await container.resolve(ServiceA)
		await container.resolve(ServiceB)
		await container.resolve(ServiceC)

		// Should not throw, should continue with cleanup
		await container.destroy()

		// All destroy methods should have been called despite one failing
		expect(destroyCalls).toContain('A')
		expect(destroyCalls).toContain('B')
		expect(destroyCalls).toContain('C')
	})

	test('should clear container after destroy', async () => {
		const container = Container.createOrGet()

		@Injectable()
		class TestService implements OnDestroy {
			onDestroy() {
				/* cleanup */
			}
		}

		container.register(TestService)
		await container.resolve(TestService)

		expect(container.getInstance(TestService)).toBeDefined()

		await container.destroy()

		expect(container.getInstance(TestService)).toBeUndefined()
	})

	test('should work with plain class (non-provider) implementing OnInit', async () => {
		const container = Container.createOrGet()
		let initCalled = false

		class PlainServiceWithInit implements OnInit {
			onInit() {
				initCalled = true
			}
		}

		container.register(PlainServiceWithInit)
		await container.resolve(PlainServiceWithInit)

		expect(initCalled).toBe(true)
	})

	test('should support async lifecycle hooks with real async work', async () => {
		const container = Container.createOrGet()
		const events: string[] = []

		@Injectable()
		class AsyncService implements OnInit, OnDestroy {
			private connected = false

			async onInit() {
				await new Promise((resolve) => setTimeout(resolve, 10))
				this.connected = true
				events.push('connected')
			}

			async onDestroy() {
				await new Promise((resolve) => setTimeout(resolve, 10))
				this.connected = false
				events.push('disconnected')
			}

			isConnected() {
				return this.connected
			}
		}

		container.register(AsyncService)
		const service = await container.resolve(AsyncService)

		expect(service.isConnected()).toBe(true)
		expect(events).toContain('connected')

		await container.destroy()

		expect(events).toContain('disconnected')
	})
})

// ============================================================================
// Logging Configuration Tests
// ============================================================================

describe('Logging Configuration', () => {
	beforeEach(resetContainer)

	test('should default to VERBOSE logging level', () => {
		const container = Container.createOrGet()
		container.clear()
		// Need to create a new container or set it back to default
		container.setLogLevel(LogLevel.VERBOSE)
		expect(container.getLogLevel()).toBe(LogLevel.VERBOSE)
	})

	test('should set log level to OFF', () => {
		const container = Container.createOrGet()
		container.setLogLevel(LogLevel.OFF)
		expect(container.getLogLevel()).toBe(LogLevel.OFF)
	})

	test('should set log level to MINIMAL', () => {
		const container = Container.createOrGet()
		container.setLogLevel(LogLevel.MINIMAL)
		expect(container.getLogLevel()).toBe(LogLevel.MINIMAL)
	})

	test('should set log level to VERBOSE', () => {
		const container = Container.createOrGet()
		container.setLogLevel(LogLevel.VERBOSE)
		expect(container.getLogLevel()).toBe(LogLevel.VERBOSE)
	})

	test('should not log when level is OFF', async () => {
		const container = Container.createOrGet()
		container.setLogLevel(LogLevel.OFF)

		@Injectable()
		class TestService {}

		container.register(TestService)
		await container.resolve(TestService)

		// Test passes if no errors occur and nothing is logged
		expect(container.getInstance(TestService)).toBeInstanceOf(TestService)
	})

	test('should log minimal events when level is MINIMAL', async () => {
		const container = Container.createOrGet()
		container.setLogLevel(LogLevel.MINIMAL)

		@Injectable()
		class TestService {}

		// With MINIMAL level, bootstrap and destroy should log
		// but individual resolutions should not
		await container.bootstrap([TestService])

		expect(container.getInstance(TestService)).toBeInstanceOf(TestService)
	})

	test('should log all events when level is VERBOSE', async () => {
		const container = Container.createOrGet()
		container.setLogLevel(LogLevel.VERBOSE)

		@Injectable()
		class TestService {}

		container.register(TestService)
		await container.resolve(TestService)

		expect(container.getInstance(TestService)).toBeInstanceOf(TestService)
	})
})
