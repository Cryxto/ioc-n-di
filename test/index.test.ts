import 'reflect-metadata'
import { expect, test, describe, beforeEach } from 'bun:test'
import {
	Container,
	Injectable,
	Inject,
	Lazy,
	LazyRef,
	lazy,
	forwardRef,
	LazyRefMarker,
	type ClassProvider,
	type ValueProvider,
	type FactoryProvider,
} from '../src'

// ============================================================================
// Test Helpers
// ============================================================================

function resetContainer() {
	// Reset the singleton container instance for clean tests
	const container = Container.getContainer()
	container.clear()
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
		public dependent: DependentService
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
	constructor(@Inject(ServiceBLazy) public serviceB: ServiceBLazy) {}
}

class ServiceBLazy {
	constructor(@Inject(lazy(() => ServiceALazy)) public serviceA: ServiceALazy) {}
}

class ServiceCLazy {
	constructor(@Lazy(ServiceD) public serviceD: LazyRef<ServiceD>) {}
}

// Circular dependency test classes (forward declaration needed)
@Injectable()
class CircularA {
	constructor(@Inject(CircularB) public b: CircularB) {}
}

@Injectable()
class CircularB {
	constructor(@Inject(CircularA) public a: CircularA) {}
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
	constructor(public a: TrackedA, public b: TrackedB) {
		resolutionOrder.push('C')
	}
}

// Resolution order tracking
const resolutionOrder: string[] = []

// Bad service for error handling tests
@Injectable()
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
		const container1 = Container.getContainer()
		const container2 = Container.getContainer()
		expect(container1).toBe(container2)
	})
})

// ============================================================================
// Basic Registration and Resolution Tests
// ============================================================================

describe('Basic Registration and Resolution', () => {
	beforeEach(resetContainer)

	test('should register and resolve a plain class', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		const instance = await container.resolve(BasicService)

		expect(instance).toBeInstanceOf(BasicService)
		expect(instance.getValue()).toBe('basic')
	})

	test('should cache resolved instances', async () => {
		const container = Container.getContainer()
		container.register(BasicService)

		const instance1 = await container.resolve(BasicService)
		const instance2 = await container.resolve(BasicService)

		expect(instance1).toBe(instance2)
	})

	test('should resolve dependencies automatically', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		container.register(DependentService)

		const instance = await container.resolve(DependentService)

		expect(instance).toBeInstanceOf(DependentService)
		expect(instance.basic).toBeInstanceOf(BasicService)
		expect(instance.getCombinedValue()).toBe('dependent-basic')
	})

	test('should resolve multiple dependencies', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		const instance = await container.resolve(MultiDependencyService)

		expect(instance.basic).toBeInstanceOf(BasicService)
		expect(instance.dependent).toBeInstanceOf(DependentService)
	})

	test('should resolve unregistered class if it is a constructor', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		const provider: ClassProvider = {
			provide: 'BasicService',
			useClass: BasicService,
		}
		container.register(provider)

		const instance = await container.resolve<BasicService>('BasicService')
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('should call onInit lifecycle hook', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		let initValue = 0

		const provider: ClassProvider<BasicService> = {
			provide: 'BasicService',
			useClass: BasicService,
			onInit: async (instance) => {
				await new Promise(resolve => setTimeout(resolve, 10))
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
		const container = Container.getContainer()
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
		const container = Container.getContainer()

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
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		const provider: FactoryProvider = {
			provide: 'factory',
			useFactory: () => ({ created: 'by-factory' }),
		}
		container.register(provider)

		const instance = await container.resolve('factory')
		expect(instance).toEqual({ created: 'by-factory' })
	})

	test('should resolve factory dependencies', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		const provider: FactoryProvider = {
			provide: 'async-factory',
			useFactory: async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
				return { async: true }
			},
		}
		container.register(provider)

		const instance = await container.resolve('async-factory')
		expect(instance).toEqual({ async: true })
	})

	test('should call onInit for factory provider', async () => {
		const container = Container.getContainer()
		let initCalled = false

		const provider: FactoryProvider = {
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
		const container = Container.getContainer()
		container.register({ provide: 'MY_TOKEN', useValue: 'token-value' })

		const value = await container.resolve('MY_TOKEN')
		expect(value).toBe('token-value')
	})

	test('should use symbol tokens', async () => {
		const container = Container.getContainer()
		const TOKEN = Symbol('MY_TOKEN')
		container.register({ provide: TOKEN, useValue: 'symbol-value' })

		const value = await container.resolve(TOKEN)
		expect(value).toBe('symbol-value')
	})

	test('should inject using @Inject decorator', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		container.register({ provide: 'CircularA', useClass: CircularA })
		container.register({ provide: 'CircularB', useClass: CircularB })

		await expect(container.resolve('CircularA')).rejects.toThrow('Circular dependency detected')
	})

	test('should support @Lazy pattern for lazy references', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		container.register(ServiceCLazy)
		container.register(ServiceD)

		const instance = await container.resolve(ServiceCLazy)
		expect(instance.serviceD).toBeInstanceOf(LazyRef)
	})

	test('should get value from LazyRef', async () => {
		const container = Container.getContainer()
		container.register(ServiceD)

		const lazyRef = new LazyRef(container, ServiceD)
		await container.resolve(ServiceD)

		const value = lazyRef.get()
		expect(value).toBeInstanceOf(ServiceD)
		expect(value.getValue()).toBe('service-d')
	})

	test('should access value property', async () => {
		const container = Container.getContainer()
		container.register(ServiceD)
		await container.resolve(ServiceD)

		const lazyRef = new LazyRef(container, ServiceD)
		expect(lazyRef.value).toBeInstanceOf(ServiceD)
	})

	test('should throw when getting unresolved LazyRef', () => {
		const container = Container.getContainer()
		const lazyRef = new LazyRef(container, ServiceD)

		expect(() => lazyRef.get()).toThrow('Instance not resolved yet')
	})

	test('should tryGetValue on unresolved LazyRef', () => {
		const container = Container.getContainer()
		const lazyRef = new LazyRef(container, ServiceD)

		expect(lazyRef.tryGetValue()).toBeUndefined()
	})

	test('should check isResolved', async () => {
		const container = Container.getContainer()
		container.register(ServiceD)
		const lazyRef = new LazyRef(container, ServiceD)

		expect(lazyRef.isResolved()).toBe(false)

		await container.resolve(ServiceD)
		expect(lazyRef.isResolved()).toBe(true)
	})

	test('should reset LazyRef', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()

		class ServiceWithLazy {
			constructor(@Inject(lazy(() => BasicService)) public basic: BasicService) {}
		}

		container.register(BasicService)
		container.register(ServiceWithLazy)

		const instance = await container.resolve(ServiceWithLazy)
		expect(instance.basic).toBeInstanceOf(BasicService)
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
		const container = Container.getContainer()
		container.register(BasicService)

		expect(container.getInstance(BasicService)).toBeUndefined()
	})

	test('getInstance should return instance after resolution', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		await container.resolve(BasicService)

		const instance = container.getInstance(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('getInstanceOrThrow should throw for unresolved', () => {
		const container = Container.getContainer()
		container.register(BasicService)

		expect(() => container.getInstanceOrThrow(BasicService)).toThrow('Instance not resolved yet')
	})

	test('getInstanceOrThrow should return instance after resolution', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		await container.resolve(BasicService)

		const instance = container.getInstanceOrThrow(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('getInstanceOrThrow should handle falsy values correctly', async () => {
		const container = Container.getContainer()

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
		const container = Container.getContainer()
		container.register({ provide: 'value', useValue: 'test' })

		expect(container.calculateWeight('value')).toBe(0)
	})

	test('should calculate weight for service with no dependencies', () => {
		const container = Container.getContainer()
		container.register(BasicService)

		expect(container.calculateWeight(BasicService)).toBe(0)
	})

	test('should calculate weight for service with dependencies', () => {
		const container = Container.getContainer()
		container.register(BasicService)
		container.register(DependentService)

		expect(container.calculateWeight(DependentService)).toBe(1)
	})

	test('should calculate weight for multi-level dependencies', () => {
		const container = Container.getContainer()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		expect(container.calculateWeight(MultiDependencyService)).toBe(2)
	})

	test('should cache weight calculations', () => {
		const container = Container.getContainer()
		container.register(BasicService)

		const weight1 = container.calculateWeight(BasicService)
		const weight2 = container.calculateWeight(BasicService)

		expect(weight1).toBe(weight2)
		expect(weight1).toBe(0)
	})

	test('should skip lazy dependencies in weight calculation', () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		container.register(MultiDependencyService)
		container.register(BasicService)
		container.register(DependentService)

		const sorted = container.getProvidersByWeight()

		expect(sorted[0]!.token).toBe(BasicService)
		expect(sorted[0]!.weight).toBe(0)
		expect(sorted[1]!.token).toBe(DependentService)
		expect(sorted[1]!.weight).toBe(1)
		expect(sorted[2]!.token).toBe(MultiDependencyService)
		expect(sorted[2]!.weight).toBe(2)
	})
})

// ============================================================================
// resolveAll Tests
// ============================================================================

describe('resolveAll', () => {
	beforeEach(resetContainer)

	test('should resolve all providers', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		container.register(DependentService)
		container.register(MultiDependencyService)

		const instances = await container.resolveAll()

		expect(instances.get(BasicService)).toBeInstanceOf(BasicService)
		expect(instances.get(DependentService)).toBeInstanceOf(DependentService)
		expect(instances.get(MultiDependencyService)).toBeInstanceOf(MultiDependencyService)
	})

	test('should resolve in optimal order', async () => {
		const container = Container.getContainer()
		container.register(TrackedC)
		container.register(TrackedA)
		container.register(TrackedB)

		await container.resolveAll()

		expect(resolutionOrder).toEqual(['A', 'B', 'C'])
	})

	test('should handle lazy dependencies in resolveAll', async () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
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
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		container.register(BasicService)
		await container.resolve(BasicService)

		const map = container.getInstancesMap()
		expect(map.get(BasicService)).toBeInstanceOf(BasicService)
	})

	test('should return read-only providers map', () => {
		const container = Container.getContainer()
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
		const container = Container.getContainer()
		await expect(container.resolve('UNKNOWN_TOKEN')).rejects.toThrow('No provider found')
	})

	test('should handle errors in factory gracefully', async () => {
		const container = Container.getContainer()

		const provider: FactoryProvider = {
			provide: 'error-factory',
			useFactory: () => {
				throw new Error('Factory error')
			},
		}
		container.register(provider)

		await expect(container.resolve('error-factory')).rejects.toThrow('Factory error')
	})

	test('should handle errors in onInit gracefully', async () => {
		const container = Container.getContainer()

		const provider: ClassProvider<BasicService> = {
			provide: 'BasicService',
			useClass: BasicService,
			onInit: () => {
				throw new Error('onInit error')
			},
		}
		container.register(provider)

		await expect(container.resolve('BasicService')).rejects.toThrow('onInit error')
	})
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
	beforeEach(resetContainer)

	test('should handle registering same provider twice', async () => {
		const container = Container.getContainer()
		container.register(BasicService)
		container.register(BasicService)

		const instance = await container.resolve(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})

	test('should handle empty dependencies array', async () => {
		const container = Container.getContainer()
		container.register(EmptyDepsService)
		const instance = await container.resolve(EmptyDepsService)

		expect(instance).toBeInstanceOf(EmptyDepsService)
	})

	test('should handle value provider with falsy values', async () => {
		const container = Container.getContainer()

		container.register({ provide: 'zero', useValue: 0 })
		container.register({ provide: 'false', useValue: false })
		container.register({ provide: 'empty', useValue: '' })

		expect(await container.resolve<number>('zero')).toBe(0)
		expect(await container.resolve<boolean>('false')).toBe(false)
		expect(await container.resolve<string>('empty')).toBe('')
	})

	test('should handle factory with no dependencies', async () => {
		const container = Container.getContainer()

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
		const container = Container.getContainer()

		const provider: ClassProvider<BasicService> = {
			provide: BasicService,
			useClass: BasicService,
		}
		container.register(provider)

		const instance = await container.resolve(BasicService)
		expect(instance).toBeInstanceOf(BasicService)
	})
})
