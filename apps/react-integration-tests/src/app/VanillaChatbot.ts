/**
 * Vanilla JS Chatbot implementation using PatternFly CSS classes
 * This component uses only DOM API for rendering and integrates with AI state management
 */

export interface Message {
  id: string;
  role: 'user' | 'bot';
  answer: string;
}

export interface VanillaChatbotOptions {
  onSendMessage: (message: string) => void;
  messages: Message[];
  inProgress: boolean;
}

export class VanillaChatbot {
  private rootElement: HTMLElement;
  private messageBoxElement!: HTMLElement;
  private inputElement!: HTMLInputElement;
  private sendButton!: HTMLButtonElement;
  private scrollTarget!: HTMLElement;
  private options: VanillaChatbotOptions;

  constructor(rootElement: HTMLElement, options: VanillaChatbotOptions) {
    this.rootElement = rootElement;
    this.options = options;
    this.init();
  }

  private init(): void {
    this.createChatbotStructure();
    this.bindEvents();
    this.render();
  }

  private createChatbotStructure(): void {
    // Clear the root element
    this.rootElement.innerHTML = '';

    // Create main chatbot container
    const chatbotContainer = document.createElement('div');
    chatbotContainer.id = 'vanilla-ai-chatbot';
    chatbotContainer.setAttribute(
      'aria-label',
      'AI Assistant Chatbot (Vanilla JS)'
    );
    chatbotContainer.className = 'pf-chatbot';
    // Override the fixed positioning from PatternFly to make it flow with document
    chatbotContainer.style.cssText = `
      position: static !important;
      inset-block-end: unset !important;
      inset-inline-end: unset !important;
      width: 100% !important;
      height: 100% !important;
    `;

    // Create chatbot container
    const container = document.createElement('div');
    container.className = 'pf-chatbot-container';

    // Create content area
    const content = document.createElement('div');
    content.className = 'pf-chatbot__content';

    // Create message box
    const messageBox = document.createElement('div');
    messageBox.className = 'pf-chatbot__messagebox';
    messageBox.style.cssText = `
      padding: 1rem;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    `;
    this.messageBoxElement = messageBox;

    // Create scroll target for auto-scrolling
    const scrollTarget = document.createElement('div');
    scrollTarget.style.height = '1px';
    this.scrollTarget = scrollTarget;
    messageBox.appendChild(scrollTarget);

    // Create footer
    const footer = document.createElement('div');
    footer.className = 'pf-chatbot__footer';
    footer.style.cssText = `
      padding: 1rem;
      border-top: 1px solid var(--pf-t--global--border--color--default);
      background-color: var(--pf-t--global--background--color--secondary--default);
    `;

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'pf-chatbot__input';
    inputContainer.style.cssText = `
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    `;

    // Create text input
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'pf-v6-c-text-input-group__text-input';
    textInput.id = 'vanilla-query-input';
    textInput.placeholder = 'Type your message...';
    textInput.setAttribute(
      'aria-label',
      'Type your message to the AI assistant'
    );
    textInput.style.cssText = `
      flex: 1;
      padding: 0.75rem 1rem;
      border: 1px solid var(--pf-t--global--border--color--default);
      border-radius: var(--pf-t--global--border--radius--pill);
      font-size: var(--pf-t--global--font--size--md);
      background-color: var(--pf-t--global--background--color--primary--default);
      color: var(--pf-t--global--text--color--regular);
    `;
    this.inputElement = textInput;

    // Create send button
    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.className = 'pf-v6-c-button pf-chatbot__button--send';
    sendButton.setAttribute('aria-label', 'Send message');
    sendButton.style.cssText = `
      border-radius: var(--pf-t--global--border--radius--pill);
      padding: var(--pf-t--global--spacer--md);
      width: 3rem;
      height: 3rem;
      border: none;
      background-color: var(--pf-t--global--background--color--action--plain--default);
      color: var(--pf-t--global--color--brand--default);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Add send icon (simple arrow)
    sendButton.innerHTML = `
      <svg fill="currentColor" height="1em" width="1em" viewBox="0 0 512 512" aria-hidden="true" role="img">
        <path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 372.7 177.2 509.9c-7.8 10.2-19.7 16.1-32.5 16.1s-24.7-5.9-32.5-16.1L64 416 5.4 250.6c-4.4-9.1-4.4-19.9 0-29s12.2-16.4 22.2-19.4L480 5.6c9.8-2.9 20.6-1.1 28.1 5z"/>
      </svg>
    `;
    this.sendButton = sendButton;

    // Assemble the structure
    inputContainer.appendChild(textInput);
    inputContainer.appendChild(sendButton);
    footer.appendChild(inputContainer);

    content.appendChild(messageBox);
    container.appendChild(content);
    container.appendChild(footer);
    chatbotContainer.appendChild(container);

    this.rootElement.appendChild(chatbotContainer);
  }

  private bindEvents(): void {
    // Handle send button click
    this.sendButton.addEventListener('click', () => {
      this.handleSend();
    });

    // Handle enter key in input
    this.inputElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.handleSend();
      }
    });

    // Button hover effects
    this.sendButton.addEventListener('mouseenter', () => {
      this.sendButton.style.backgroundColor =
        'var(--pf-t--chatbot--blue-icon--background--color--hover)';
      this.sendButton.style.color =
        'var(--pf-t--chatbot--blue-icon--fill--hover)';
    });

    this.sendButton.addEventListener('mouseleave', () => {
      this.sendButton.style.backgroundColor =
        'var(--pf-t--global--background--color--action--plain--default)';
      this.sendButton.style.color =
        'var(--pf-t--global--color--brand--default)';
    });
  }

  private handleSend(): void {
    const message = this.inputElement.value.trim();
    if (message && !this.options.inProgress) {
      this.options.onSendMessage(message);
      this.inputElement.value = '';
    }
  }

  private createMessageElement(message: Message): HTMLElement {
    const messageContainer = document.createElement('div');
    messageContainer.className = `pf-chatbot__message pf-chatbot__message--${message.role}`;
    messageContainer.id = `vanilla-message-${message.id}`;
    messageContainer.style.cssText = `
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1rem;
      ${message.role === 'user' ? 'flex-direction: row-reverse;' : ''}
    `;

    // Create avatar
    const avatar = document.createElement('div');
    avatar.className = 'pf-chatbot__message-avatar';
    avatar.style.cssText = `
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      background-color: var(--pf-t--global--background--color--tertiary--default);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: var(--pf-t--global--text--color--subtle);
      flex-shrink: 0;
    `;
    avatar.textContent = message.role === 'user' ? 'U' : 'AI';

    // Create message content
    const messageContent = document.createElement('div');
    messageContent.className = 'pf-chatbot__message-and-actions';
    messageContent.style.cssText = `
      flex: 1;
      ${
        message.role === 'user'
          ? 'display: flex; justify-content: flex-end;'
          : ''
      }
    `;

    // Create message text
    const messageText = document.createElement('div');
    messageText.className = 'pf-chatbot__message-text';
    messageText.style.cssText = `
      width: fit-content;
      padding: var(--pf-t--global--spacer--sm);
      border-radius: var(--pf-t--global--border--radius--small);
      ${
        message.role === 'user'
          ? `background-color: var(--pf-t--global--color--brand--default);
           color: var(--pf-t--global--text--color--on-brand--default);`
          : `background-color: var(--pf-t--global--background--color--tertiary--default);
           color: var(--pf-t--global--text--color--regular);`
      }
      max-width: 70%;
      word-wrap: break-word;
      font-size: var(--pf-t--global--font--size--md);
      line-height: 1.5;
    `;

    // Set message content with basic HTML support
    if (message.answer.includes('\n')) {
      // Handle line breaks
      messageText.innerHTML = message.answer.replace(/\n/g, '<br>');
    } else {
      messageText.textContent = message.answer;
    }

    messageText.setAttribute(
      'aria-label',
      `${message.role === 'user' ? 'Your message' : 'AI response'}: ${
        message.answer
      }`
    );

    messageContent.appendChild(messageText);
    messageContainer.appendChild(avatar);
    messageContainer.appendChild(messageContent);

    return messageContainer;
  }

  private scrollToBottom(): void {
    // Scroll to the bottom of the message box
    this.scrollTarget.scrollIntoView({ behavior: 'smooth' });
  }

  public updateOptions(newOptions: VanillaChatbotOptions): void {
    this.options = newOptions;
    this.render();
  }

  private render(): void {
    // Clear existing messages (except scroll target)
    const existingMessages = this.messageBoxElement.querySelectorAll(
      '.pf-chatbot__message'
    );
    existingMessages.forEach((msg) => msg.remove());

    // Render all messages
    this.options.messages.forEach((message) => {
      const messageElement = this.createMessageElement(message);
      this.messageBoxElement.insertBefore(messageElement, this.scrollTarget);
    });

    // Update send button state
    this.sendButton.disabled = this.options.inProgress;
    if (this.options.inProgress) {
      this.sendButton.style.opacity = '0.6';
      this.sendButton.style.cursor = 'not-allowed';
    } else {
      this.sendButton.style.opacity = '1';
      this.sendButton.style.cursor = 'pointer';
    }

    // Update input state
    this.inputElement.disabled = this.options.inProgress;
    if (this.options.inProgress) {
      this.inputElement.style.opacity = '0.6';
    } else {
      this.inputElement.style.opacity = '1';
    }

    // Auto-scroll to bottom
    setTimeout(() => this.scrollToBottom(), 100);
  }

  public destroy(): void {
    // Clean up event listeners and DOM
    this.rootElement.innerHTML = '';
  }
}
