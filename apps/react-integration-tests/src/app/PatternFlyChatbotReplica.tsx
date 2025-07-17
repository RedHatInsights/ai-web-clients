import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useMessages, useSendMessage, useInProgress } from '@redhat-cloud-services/ai-react-state';

// Custom Message component that replicates PF Chatbot Message
interface CustomMessageProps {
  id: string;
  role: 'user' | 'bot';
  content: string;
  avatar?: string;
  isLoading?: boolean;
  'aria-label'?: string;
}

const CustomMessage = ({ id, role, content, avatar, isLoading, 'aria-label': ariaLabel }: CustomMessageProps) => {
  return (
    <section 
      className={`pf-chatbot__message pf-chatbot__message--${role}`}
      id={id}
      aria-label={ariaLabel}
    >
      {avatar && (
        <img 
          src={avatar} 
          alt={`${role} avatar`} 
          className="pf-chatbot__message-avatar" 
        />
      )}
      <div className="pf-chatbot__message-contents">
        <div className="pf-chatbot__message-response">
          {isLoading ? (
            <div className="pf-chatbot__message-loading">
              <span className="pf-chatbot__message-loading-dots">
                <span className="pf-v6-screen-reader">Loading message</span>
              </span>
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    </section>
  );
};

// Custom MessageBox component
interface CustomMessageBoxProps {
  children: React.ReactNode;
}

const CustomMessageBox = ({ children }: CustomMessageBoxProps) => {
  return (
    <div 
      className="pf-chatbot__messagebox" 
      role="region" 
      tabIndex={0}
      aria-label="Scrollable message log"
    >
      {children}
      <div className="pf-chatbot__messagebox-announcement" aria-live="polite"></div>
    </div>
  );
};

// Custom MessageBar component
interface CustomMessageBarProps {
  id: string;
  onSendMessage: (message: string) => void;
  'aria-label'?: string;
  isSendButtonDisabled?: boolean;
  hasAttachButton?: boolean;
  alwayShowSendButton?: boolean;
}

const CustomMessageBar = ({ 
  id, 
  onSendMessage, 
  'aria-label': ariaLabel, 
  isSendButtonDisabled = false,
  hasAttachButton = true,
  alwayShowSendButton = false
}: CustomMessageBarProps) => {
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (inputValue.trim() && !isSendButtonDisabled) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showSendButton = alwayShowSendButton || inputValue.trim().length > 0;

  return (
    <div className="pf-chatbot__message-bar">
      <div className="pf-chatbot__message-bar-input">
        <textarea
          id={id}
          className="pf-chatbot__message-textarea"
          placeholder="Send a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          aria-label={ariaLabel}
          rows={1}
          style={{ 
            resize: 'none',
            outline: 'none',
            border: '1px solid var(--pf-t--global--border--color--default)',
            borderRadius: 'var(--pf-t--global--border--radius--pill)',
            padding: '0.75rem 1rem',
            fontSize: 'var(--pf-t--global--font--size--md)',
            backgroundColor: 'var(--pf-t--global--background--color--primary--default)',
            color: 'var(--pf-t--global--text--color--regular)'
          }}
        />
      </div>
      <div className="pf-chatbot__message-bar-actions">
        {hasAttachButton && (
          <button
            className="pf-v5-c-button pf-m-plain"
            type="button"
            aria-label="Attach files"
          >
            <i className="fas fa-paperclip" aria-hidden="true"></i>
          </button>
        )}
        {showSendButton && (
          <button
            className={`pf-v5-c-button pf-m-primary ${isSendButtonDisabled ? 'pf-m-disabled' : ''}`}
            type="button"
            onClick={handleSend}
            disabled={isSendButtonDisabled}
            aria-label="Send message"
            style={{
              borderRadius: 'var(--pf-t--global--border--radius--pill)',
              padding: 'var(--pf-t--global--spacer--md)',
              width: '3rem',
              height: '3rem',
              border: 'none',
              backgroundColor: 'var(--pf-t--global--background--color--action--plain--default)',
              color: 'var(--pf-t--global--color--brand--default)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              if (!isSendButtonDisabled) {
                e.currentTarget.style.backgroundColor = 'var(--pf-t--chatbot--blue-icon--background--color--hover)';
                e.currentTarget.style.color = 'var(--pf-t--chatbot--blue-icon--fill--hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSendButtonDisabled) {
                e.currentTarget.style.backgroundColor = 'var(--pf-t--global--background--color--action--plain--default)';
                e.currentTarget.style.color = 'var(--pf-t--global--color--brand--default)';
              }
            }}
          >
            <svg fill="currentColor" height="1em" width="1em" viewBox="0 0 512 512" aria-hidden="true" role="img">
              <path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 372.7 177.2 509.9c-7.8 10.2-19.7 16.1-32.5 16.1s-24.7-5.9-32.5-16.1L64 416 5.4 250.6c-4.4-9.1-4.4-19.9 0-29s12.2-16.4 22.2-19.4L480 5.6c9.8-2.9 20.6-1.1 28.1 5z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

// Custom ChatbotFooter component
interface CustomChatbotFooterProps {
  children: React.ReactNode;
}

const CustomChatbotFooter = ({ children }: CustomChatbotFooterProps) => {
  return (
    <div className="pf-chatbot__footer">
      <div className="pf-chatbot__footer-container">
        {children}
      </div>
    </div>
  );
};

// Custom ChatbotContent component
interface CustomChatbotContentProps {
  children: React.ReactNode;
}

const CustomChatbotContent = ({ children }: CustomChatbotContentProps) => {
  return (
    <div className="pf-chatbot__content">
      {children}
    </div>
  );
};

// Custom Chatbot container component
interface CustomChatbotProps {
  children: React.ReactNode;
}

const CustomChatbot = ({ children }: CustomChatbotProps) => {
  return (
    <div className="pf-chatbot pf-chatbot--default" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      <section
        aria-label="Chatbot"
        className="pf-chatbot-container pf-chatbot-container--default"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
};

// Main PatternFly Chatbot Replica component
interface PatternFlyChatbotReplicaProps {
  /** Position style for the chatbot container */
  containerStyle?: React.CSSProperties;
  /** Custom className for additional styling */
  className?: string;
}

export const PatternFlyChatbotReplica = ({ 
  containerStyle = {}, 
  className = '' 
}: PatternFlyChatbotReplicaProps = {}) => {
  const messages = useMessages();
  const sendMessage = useSendMessage();
  const inProgress = useInProgress();
  const scrollToBottomRef = useRef<HTMLDivElement>(null);

  const handleSend = (message: string) => {
    sendMessage({
      id: Date.now().toString(),
      role: 'user',
      answer: message,
    }, {
      stream: true,
    });
  };

  useEffect(() => {
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div 
      id="pf-replica-chatbot" 
      aria-label="PatternFly Replica AI Assistant Chatbot"
      className={className}
      style={containerStyle}
    >
      <CustomChatbot>
        <CustomChatbotContent>
          <CustomMessageBox>
            {messages.map((message) => (
              <CustomMessage
                key={message.id}
                id={`pf-replica-message-${message.id}`}
                role={message.role}
                content={message.answer}
                avatar="https://placehold.co/40"
                isLoading={message.role === 'bot' && message.answer.length === 0}
                aria-label={`${message.role === 'user' ? 'Your message' : 'AI response'}: ${message.answer}`}
              />
            ))}
            <div ref={scrollToBottomRef}></div>
          </CustomMessageBox>
        </CustomChatbotContent>
        <CustomChatbotFooter>
          <CustomMessageBar
            id="pf-replica-query-input"
            onSendMessage={handleSend}
            aria-label="Type your message to the AI assistant"
            alwayShowSendButton={true}
            isSendButtonDisabled={inProgress}
            hasAttachButton={false}
          />
        </CustomChatbotFooter>
      </CustomChatbot>
    </div>
  );
}; 