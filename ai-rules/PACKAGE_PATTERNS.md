# Package Development Patterns
## AI Web Clients NX Workspace

> Part of the modular AI context system. See [AI_CONTEXT.md](./AI_CONTEXT.md) for overview.

---

## 📦 PACKAGE DEVELOPMENT PATTERNS

### **AI Client State Package (Conversation Management)**

The `ai-client-state` package provides comprehensive state management for AI client interactions with conversation management capabilities, including conversation locking functionality.

#### **Public API**
```typescript
export interface StateManager<T> {
  // Initialization
  init(): Promise<void>;
  isInitialized(): boolean;
  isInitializing(): boolean;
  
  // Conversation Management
  setActiveConversationId(conversationId: string): Promise<void>;
  getActiveConversationId(): string | null;
  getActiveConversationMessages(): Message<T>[];
  getConversations(): Conversation<T>[];
  createNewConversation(force?: boolean): Promise<IConversation>;
  isTemporaryConversation(): boolean;
  
  // Message Management
  sendMessage(query: UserQuery, options?: MessageOptions): Promise<any>;
  getMessageInProgress(): boolean;
  
  // State Access
  getState(): ClientState<T>;
  getClient(): IAIClient<T>;
  getInitLimitation(): ClientInitLimitation | undefined;
  
  // Event System
  subscribe(event: Events, callback: () => void): () => void;
}

export enum Events {
  MESSAGE = 'message',
  ACTIVE_CONVERSATION = 'active-conversation',
  IN_PROGRESS = 'in-progress',
  CONVERSATIONS = 'conversations',
  INITIALIZING_MESSAGES = 'initializing-messages',
  INIT_LIMITATION = 'init-limitation',
}
```

#### **Key Features**
- **Lazy initialization**: Conversations are created automatically on first sendMessage (no auto-creation during init)
- **Temporary conversation pattern**: Uses temporary conversation ID (`'__temp_conversation__'`) before promotion
- **Automatic promotion**: First sendMessage automatically promotes temporary to real conversation
- **Multi-conversation support**: Manage multiple conversations simultaneously
- **Active conversation tracking**: Set and track the currently active conversation
- **Conversation locking**: Prevent message sending to locked conversations with automatic error handling
- **Message streaming integration**: Works with client streaming handlers for real-time updates
- **Event-driven architecture**: Subscribe to state changes across the application
- **Conversation history**: Automatic loading of conversation history when switching conversations
- **Message persistence**: Messages are stored and maintained across conversation switches
- **Retry logic**: Promotion failures include retry mechanism with user-friendly error messages

### **AI React State Package (React Integration)**

The `ai-react-state` package provides React hooks for seamless integration with the AI client state manager.

#### **Public API**
```typescript
// Provider Components
export const AIStateProvider: React.Component<{
  stateManager?: StateManager;
  client?: IAIClient;
  children: React.ReactNode;
}>;

// React Hooks
export function useActiveConversation(): Conversation | undefined;
export function useSendMessage(): (query: UserQuery, options?: MessageOptions) => Promise<any>;
export function useMessages<T>(): Message<T>[];
export function useInProgress(): boolean;
export function useConversations<T>(): Conversation<T>[];
export function useCreateNewConversation(): () => Promise<IConversation>;
export function useSetActiveConversation(): (conversationId: string) => Promise<void>;
export function useIsInitializing(): boolean;
export function useClient<T>(): IAIClient<T>;
export function useInitLimitation(): ClientInitLimitation | undefined;
```

#### **Key Features**
- **React Context integration**: Provides AIStateProvider for state sharing across components
- **Reactive hooks**: Automatically re-render components when state changes
- **Full state manager access**: All state manager functionality available as React hooks
- **TypeScript support**: Full type safety for conversation and message data
- **Event-driven updates**: Hooks automatically subscribe to relevant state events

### **LightSpeed Client Package**

The `lightspeed-client` package provides TypeScript client functionality for the OpenShift LightSpeed API.

#### **Architecture**
- Follows the same architectural patterns as the ARH client (reference implementation)
- Implements `IAIClient<LightSpeedCoreAdditionalProperties>` interface from ai-client-common
- Supports streaming and non-streaming message handling
- Includes dependency injection for fetch function and streaming handlers
- Compatible with ai-client-state for conversation management

#### **Main Class**
```typescript
export class LightspeedClient implements IAIClient<LightSpeedCoreAdditionalProperties> {
  constructor(config: LightspeedClientConfig);
  // Implements all IAIClient methods for LightSpeed API
}
```

### **IFD Client Package (Reference Implementation)**

The `arh-client` package serves as the reference implementation for all future packages in this workspace.

#### **Architecture Decisions**
- **Dependency Injection**: All external deps injectable
- **Interface Segregation**: Clear separation of concerns
- **Error Handling**: Custom error hierarchy
- **Streaming Support**: Native JavaScript implementation
- **Conversation Management**: Support for conversation locking via `locked` property
- **Type Safety**: Complete TypeScript coverage

#### **File Structure Pattern**
```
src/lib/
├── client.ts              # Main client class
├── interfaces.ts          # Dependency injection contracts
├── types.ts               # API types + error classes
├── {feature}-types.ts     # Feature-specific types
├── {feature}-handler.ts   # Feature implementations
├── examples.ts            # Usage examples
└── index.ts               # Public API exports
```

#### **API Client Pattern**
```typescript
// Standard method structure for all packages
async methodName(
  required: string,
  optional?: RequestOptions
): Promise<ResponseType> {
  return this.makeRequest<ResponseType>('/api/endpoint', {
    method: 'POST',
    body: JSON.stringify(data),
    ...optional
  });
}
```

### **Common Interface Patterns**

#### **IAIClient Interface (ai-client-common)**
All AI clients must implement this interface:

```typescript
export interface IAIClient<T extends Record<string, unknown> = Record<string, unknown>> {
  // Initialization
  init(): Promise<{
    conversations: IConversation[];
    limitation?: ClientInitLimitation;
    error?: IInitErrorResponse;
  }>;
  
  // Core messaging
  sendMessage(
    conversationId: string,
    message: string,
    options?: ISendMessageOptions<T>
  ): Promise<IMessageResponse<T> | void>;
  
  // Conversation management
  createNewConversation(): Promise<IConversation>;
  getConversationHistory(
    conversationId: string,
    options?: IRequestOptions
  ): Promise<IConversationHistoryResponse<T>>;
  
  // Health and status
  healthCheck(options?: IRequestOptions): Promise<unknown>;
  getServiceStatus?(options?: IRequestOptions): Promise<unknown>;
  
  // Streaming support
  getDefaultStreamingHandler?<TChunk>(): IStreamingHandler<TChunk> | undefined;
}
```

#### **Message and Conversation Types**
```typescript
export interface Message<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  answer: string;
  role: 'user' | 'bot';
  additionalAttributes?: T;
  date: Date;
}

export interface Conversation<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  title: string;
  messages: Message<T>[];
  locked: boolean;
  createdAt: Date;
}

export interface IConversation {
  id: string;
  title: string;
  locked: boolean;
  createdAt: Date;
}
```

### **Dependency Injection Patterns**

#### **Client Configuration**
```typescript
export interface ClientConfig {
  baseUrl: string;
  fetchFunction: IFetchFunction;
  defaultStreamingHandler?: IStreamingHandler<ResponseType>;
  // Additional client-specific options
}
```

#### **Streaming Handler Pattern**
```typescript
export interface IStreamingHandler<TChunk> {
  onStart?: () => void;
  onChunk?: (chunk: TChunk) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}
```

### **New Package Guidelines**

When creating new packages in this workspace:

1. **Use IFD Client as Template**
   - Copy architectural patterns
   - Adapt dependency injection approach
   - Maintain error handling standards

2. **Package Naming**
   - Use `@redhat-cloud-services/{service-name}-client` pattern
   - Keep names descriptive and consistent

3. **Configuration**
   - Copy and adapt `project.json` from arh-client
   - Ensure proper NX target configuration
   - Maintain consistent package.json structure
   - **Set `"importHelpers": false`** in tsconfig to avoid tslib dependency
   - Keep dependencies section empty unless absolutely required

4. **Interface Implementation**
   - Implement `IAIClient<YourAdditionalProperties>` from ai-client-common
   - Define your service-specific additional properties type
   - Follow the established method signatures

5. **Error Handling**
   - Create service-specific error classes extending `AIClientError`
   - Implement proper error transformation for `IInitErrorResponse`
   - Handle network errors and API-specific error responses

### **State Management Patterns**

#### **Creating State Managers**
```typescript
// Always use the factory function
const stateManager = createClientStateManager(client);

// Initialize (no longer auto-creates conversations)
await stateManager.init();

// LAZY INITIALIZATION: First sendMessage auto-creates conversation
const response = await stateManager.sendMessage('Hello'); // Auto-promotes temporary conversation

// Or manually create and set conversation
const conversation = await stateManager.createNewConversation();
await stateManager.setActiveConversationId(conversation.id);

// Check if current conversation is temporary
const isTemp = stateManager.isTemporaryConversation(); // false after promotion
```

#### **Event Subscription Patterns**
```typescript
// Subscribe to state changes
const unsubscribe = stateManager.subscribe(Events.MESSAGE, () => {
  console.log('Messages updated');
});

// Clean up subscriptions
unsubscribe();
```

#### **React Integration Patterns**
```typescript
// Provider setup
<AIStateProvider stateManager={stateManager}>
  <App />
</AIStateProvider>

// Hook usage
function MessageComponent() {
  const messages = useMessages();
  const sendMessage = useSendMessage();
  const isInProgress = useActiveInProgress();
  
  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.answer}</div>)}
      <button 
        onClick={() => sendMessage('Hello')}
        disabled={isInProgress}
      >
        Send
      </button>
    </div>
  );
}
```

### **Package Development Checklist**

When developing a new package:

- [ ] Implement `IAIClient` interface
- [ ] Define service-specific additional properties type
- [ ] Create dependency injection configuration interface
- [ ] Implement proper error handling with custom error classes
- [ ] Add streaming support with default handler fallback
- [ ] Create comprehensive unit tests
- [ ] Add integration tests with ai-client-state
- [ ] Document usage patterns in USAGE.md
- [ ] Follow TypeScript strict mode requirements
- [ ] Maintain zero runtime dependencies preference
- [ ] Implement conversation locking support
- [ ] Add proper NX project configuration

---

## 🔧 ADVANCED PATTERNS

### **Custom Streaming Handlers**
```typescript
const customHandler: IStreamingHandler<MessageChunkResponse> = {
  onStart: () => console.log('Stream started'),
  onChunk: (chunk) => console.log('Received:', chunk.answer),
  onComplete: () => console.log('Stream completed'),
  onError: (error) => console.error('Stream error:', error)
};

const client = new IFDClient({
  baseUrl: 'https://api.example.com',
  fetchFunction: (input, init) => fetch(input, init),
  defaultStreamingHandler: customHandler
});
```

### **Authentication Patterns**
```typescript
const authenticatedClient = new IFDClient({
  baseUrl: 'https://api.example.com',
  fetchFunction: async (input, init) => {
    const token = await getAuthToken();
    return fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`
      }
    });
  }
});
```

### **Error Recovery Patterns**
```typescript
// Client-level retry logic
async function sendMessageWithRetry(message: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await stateManager.sendMessage(message);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

---

> For error handling patterns, see [ERROR_HANDLING_PATTERNS.md](./ERROR_HANDLING_PATTERNS.md)  
> For testing strategies, see [TESTING_STRATEGIES.md](./TESTING_STRATEGIES.md)  
> For development guidelines, see [DEVELOPMENT_GUIDELINES.md](./DEVELOPMENT_GUIDELINES.md)