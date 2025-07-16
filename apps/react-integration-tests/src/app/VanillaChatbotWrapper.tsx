import { useContext, useEffect, useRef } from 'react';
import { AIStateContext } from '@redhat-cloud-services/ai-react-state';
import { Events } from '@redhat-cloud-services/ai-client-state';
import { VanillaChatbot } from './VanillaChatbot';

const VanillaChatbotWrapper = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chatbotInstanceRef = useRef<VanillaChatbot | null>(null);
  const { getState } = useContext(AIStateContext);
  
  // Initialize the vanilla chatbot and set up subscriptions
  useEffect(() => {
    if (!containerRef.current) return;

    const stateManager = getState();
    
    // Handle sending messages directly through state manager
    const handleSendMessage = (message: string) => {
      stateManager.sendMessage({
        id: Date.now().toString(), // Simple ID generation
        role: 'user',
        answer: message,
      }, {
        stream: true,
      });
    };

    // Get initial state
    const initialMessages = stateManager.getActiveConversationMessages();
    const initialInProgress = stateManager.getMessageInProgress();

    // Create chatbot instance
    chatbotInstanceRef.current = new VanillaChatbot(containerRef.current, {
      onSendMessage: handleSendMessage,
      messages: initialMessages,
      inProgress: initialInProgress,
    });

    // Subscribe to state changes directly
    const unsubscribeMessages = stateManager.subscribe(Events.MESSAGE, () => {
      if (chatbotInstanceRef.current) {
        const messages = stateManager.getActiveConversationMessages();
        const inProgress = stateManager.getMessageInProgress();
        chatbotInstanceRef.current.updateOptions({
          onSendMessage: handleSendMessage,
          messages: messages,
          inProgress: inProgress,
        });
      }
    });

    const unsubscribeInProgress = stateManager.subscribe(Events.IN_PROGRESS, () => {
      if (chatbotInstanceRef.current) {
        const messages = stateManager.getActiveConversationMessages();
        const inProgress = stateManager.getMessageInProgress();
        chatbotInstanceRef.current.updateOptions({
          onSendMessage: handleSendMessage,
          messages: messages,
          inProgress: inProgress,
        });
      }
    });

    const unsubscribeActiveConversation = stateManager.subscribe(Events.ACTIVE_CONVERSATION, () => {
      if (chatbotInstanceRef.current) {
        const messages = stateManager.getActiveConversationMessages();
        const inProgress = stateManager.getMessageInProgress();
        chatbotInstanceRef.current.updateOptions({
          onSendMessage: handleSendMessage,
          messages: messages,
          inProgress: inProgress,
        });
      }
    });
    
    return () => {
      // Clean up subscriptions
      unsubscribeMessages();
      unsubscribeInProgress();
      unsubscribeActiveConversation();
      
      // Clean up chatbot instance
      if (chatbotInstanceRef.current) {
        chatbotInstanceRef.current.destroy();
        chatbotInstanceRef.current = null;
      }
    };
  }, []); // Only run once on mount

  return (
    <div 
      ref={containerRef}
      id="vanilla-chatbot-container"
      style={{ 
        width: '100%', 
        height: '600px',
        border: '2px solid var(--pf-t--global--border--color--default)',
        borderRadius: 'var(--pf-t--global--border--radius--medium)',
        overflow: 'hidden'
      }}
    />
  );
};

export default VanillaChatbotWrapper; 