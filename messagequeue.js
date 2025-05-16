// messageQueue.js - Message queue implementation
const amqp = require('amqplib');

class MessageQueue {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.initialize();
  }

  async initialize() {
    try {
      this.connection = await amqp.connect('amqp://localhost');
      this.channel = await this.connection.createChannel();
      
      // Create queues for different message types
      await this.channel.assertQueue('chat_messages', { durable: true });
      await this.channel.assertQueue('notifications', { durable: true });
      
      console.log('Message queue system initialized');
      
      // Start processing messages
      this.startMessageProcessing();
    } catch (error) {
      console.error('Failed to initialize message queue:', error);
      // Retry after 5 seconds
      setTimeout(() => this.initialize(), 5000);
    }
  }

  async queueMessage(message) {
    if (!this.channel) {
      throw new Error('Message queue not initialized');
    }
    
    // Add to messages queue
    return this.channel.sendToQueue(
      'chat_messages', 
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
  }

  async queueNotification(notification) {
    if (!this.channel) {
      throw new Error('Message queue not initialized');
    }
    
    // Add to notifications queue
    return this.channel.sendToQueue(
      'notifications', 
      Buffer.from(JSON.stringify(notification)),
      { persistent: true }
    );
  }

  async startMessageProcessing() {
    // Process chat messages
    this.channel.consume('chat_messages', async (msg) => {
      if (msg) {
        try {
          const message = JSON.parse(msg.content.toString());
          
          // Process and store the message
          await this.processMessage(message);
          
          // Acknowledge the message was processed
          this.channel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          // Requeue the message
          this.channel.nack(msg);
        }
      }
    });
    
    // Process notifications
    this.channel.consume('notifications', async (msg) => {
      if (msg) {
        try {
          const notification = JSON.parse(msg.content.toString());
          
          // Process the notification
          await this.processNotification(notification);
          
          // Acknowledge the notification was processed
          this.channel.ack(msg);
        } catch (error) {
          console.error('Error processing notification:', error);
          // Requeue the notification
          this.channel.nack(msg);
        }
      }
    });
  }

  async processMessage(message) {
    // In a real application, this would:
    // 1. Save the message to the database
    // 2. Update message indexes for search
    // 3. Process any special commands or mentions
    // 4. Generate notifications if needed
    
    console.log(`Processing message: ${JSON.stringify(message)}`);
    
    // Generate delivery notifications
    const notification = {
      type: 'message_delivered',
      messageId: message.id,
      chatId: message.chatId,
      recipients: message.recipients
    };
    
    await this.queueNotification(notification);
  }

  async processNotification(notification) {
    // In a real application, this would:
    // 1. Send push notifications to user devices
    // 2. Update notification counters
    // 3. Store notification history
    
    console.log(`Processing notification: ${JSON.stringify(notification)}`);
  }
  
  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}

module.exports = MessageQueue;