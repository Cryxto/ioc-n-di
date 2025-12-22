import 'reflect-metadata'
import { Container, getInjectableMetadata, Inject, Injectable } from '../src'

// ============================================================================
// Example: NestJS-Style Bootstrapping with Metadata
// ============================================================================

/**
 * Configuration service with metadata
 */
@Injectable({ metadata: { role: 'config', priority: 'high' } })
class ConfigService {
	private config = {
		port: 3000,
		database: {
			host: 'localhost',
			port: 5432,
		},
	}

	getPort(): number {
		return this.config.port
	}

	getDatabaseConfig() {
		return this.config.database
	}
}

/**
 * Database service with custom scope metadata
 */
@Injectable({ scope: 'singleton', metadata: { layer: 'data' } })
class DatabaseService {
	constructor(private config: ConfigService) {}

	async connect(): Promise<void> {
		const dbConfig = this.config.getDatabaseConfig()
		console.log(
			`🔌 Connecting to database at ${dbConfig.host}:${dbConfig.port}`,
		)
		// Simulate connection
		await new Promise((resolve) => setTimeout(resolve, 100))
		console.log('✅ Database connected!')
	}

	async query(sql: string): Promise<unknown[]> {
		console.log(`📊 Executing query: ${sql}`)
		return []
	}
}

/**
 * User repository
 */
@Injectable({ metadata: { layer: 'repository' } })
class UserRepository {
	constructor(private db: DatabaseService) {}

	async findAll() {
		return this.db.query('SELECT * FROM users')
	}

	async findById(id: number) {
		return this.db.query(`SELECT * FROM users WHERE id = ${id}`)
	}
}

/**
 * User service with business logic
 */
@Injectable({ metadata: { layer: 'service' } })
class UserService {
	constructor(private userRepo: UserRepository) {}

	async getAllUsers() {
		console.log('👥 Getting all users...')
		return this.userRepo.findAll()
	}

	async getUser(id: number) {
		console.log(`👤 Getting user with id: ${id}`)
		return this.userRepo.findById(id)
	}
}

/**
 * Auth service
 */
@Injectable({ metadata: { layer: 'service', security: true } })
class AuthService {
	constructor(private userService: UserService) {}

	async login(username: string, _password: string) {
		console.log(`🔐 Authenticating user: ${username}`)
		// Simulate authentication
		const users = await this.userService.getAllUsers()
		return { token: 'mock-jwt-token', user: users[0] }
	}
}

/**
 * Logger service (external token example)
 */
const LOGGER_TOKEN = Symbol('Logger')

interface Logger {
	log(message: string): void
	error(message: string): void
}

/**
 * Application service using token injection
 */
@Injectable()
class AppService {
	constructor(
		private auth: AuthService,
		@Inject(LOGGER_TOKEN) private logger: Logger,
	) {}

	async start() {
		this.logger.log('🚀 Application starting...')
		await this.auth.login('admin', 'password')
		this.logger.log('✅ Application started successfully!')
	}
}

// ============================================================================
// Bootstrap Application (NestJS-Style)
// ============================================================================

async function bootstrapApp() {
	console.log('\n═══════════════════════════════════════════════════════')
	console.log('  NestJS-Style Bootstrapping Example')
	console.log('═══════════════════════════════════════════════════════\n')

	const container = Container.createOrGet()

	// Bootstrap with providers (NestJS-style)
	await container.bootstrap([
		// Configuration
		ConfigService,

		// Data layer
		DatabaseService,
		UserRepository,

		// Service layer
		UserService,
		AuthService,

		// Application
		AppService,

		// External dependencies
		{
			provide: LOGGER_TOKEN,
			useValue: {
				log: (msg: string) => console.log(`[LOG] ${msg}`),
				error: (msg: string) => console.error(`[ERROR] ${msg}`),
			} as Logger,
		},
	])

	console.log('\n═══════════════════════════════════════════════════════')
	console.log('  Inspecting Injectable Metadata')
	console.log('═══════════════════════════════════════════════════════\n')

	// Demonstrate metadata retrieval
	const services = [
		ConfigService,
		DatabaseService,
		UserService,
		AuthService,
		UserRepository,
	]

	for (const service of services) {
		const metadata = getInjectableMetadata(service)
		console.log(`📦 ${service.name}:`)
		console.log(`   Scope: ${metadata?.scope}`)
		console.log(`   Metadata: ${JSON.stringify(metadata?.metadata || {})}`)
		console.log('')
	}

	console.log('\n═══════════════════════════════════════════════════════')
	console.log('  Running Application')
	console.log('═══════════════════════════════════════════════════════\n')

	// Get the app service and start it
	const app = container.getInstanceOrThrow<AppService>(AppService)
	await app.start()

	console.log('\n═══════════════════════════════════════════════════════')
	console.log('  Alternative: Bootstrap with Config Object')
	console.log('═══════════════════════════════════════════════════════\n')

	// Clear container for demonstration
	const container2 = Container.createOrGet()
	container2.clear()

	// Alternative bootstrap syntax (object-based)
	await container2.bootstrap({
		providers: [ConfigService, DatabaseService, UserRepository, UserService],
	})

	console.log('✅ Alternative bootstrap completed!')
}

// Run the example
bootstrapApp().catch(console.error)
