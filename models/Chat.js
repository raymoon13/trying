// models/Chat.js - MongoDB model for chats
const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  name: {
    type: String,
    required: function() { return this.isGroup; } // Name required only for group chats
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  avatar: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: ''
  },
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    encrypted: {
      type: Boolean,
      default: true
    },
    retention: {
      type: Number, // Days to keep messages
      default: 0 // 0 means forever
    }
  }
});

// Add methods and indexes
ChatSchema.index({ participants: 1 });
ChatSchema.index({ createdAt: -1 });

ChatSchema.methods.addParticipant = async function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    await this.save();
  }
};

ChatSchema.methods.removeParticipant = async function(userId) {
  if (this.participants.includes(userId)) {
    this.participants = this.participants.filter(id => id.toString() !== userId.toString());
    await this.save();
  }
};

const Chat = mongoose.model('Chat', ChatSchema);

module.exports = Chat;

// models/Message.js - MongoDB model for messages
const MessageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: function() { return !this.attachments || this.attachments.length === 0; }
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document', 'location']
    },
    url: String,
    thumbnail: String,
    name: String,
    size: Number,
    metadata: mongoose.Schema.Types.Mixed
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  deliveredTo: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  meta: {
    edited: {
      type: Boolean,
      default: false
    },
    editHistory: [{
      content: String,
      timestamp: Date
    }]
  }
});

// Add indexes for faster queries
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ 'readBy.user': 1 });

// Hooks for updating chat lastActivity
MessageSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      // Update the chat's lastActivity timestamp
      await mongoose.model('Chat').findByIdAndUpdate(
        this.chatId,
        { lastActivity: Date.now() }
      );
    } catch (error) {
      console.error('Error updating chat lastActivity:', error);
    }
  }
  next();
});

const Message = mongoose.model('Message', MessageSchema);

module.exports = Message;

// models/User.js - MongoDB model for users
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  profilePicture: {
    type: String,
    default: null
  },
  status: {
    text: {
      type: String,
      default: ''
    },
    presence: {
      type: String,
      enum: ['online', 'offline', 'away', 'busy'],
      default: 'offline'
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  contacts: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    nickname: String,
    blocked: {
      type: Boolean,
      default: false
    },
    muted: {
      type: Boolean,
      default: false
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  devices: [{
    deviceId: String,
    platform: {
      type: String,
      enum: ['ios', 'android', 'web', 'desktop']
    },
    lastLogin: Date,
    pushToken: String
  }],
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    privacy: {
      lastSeen: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      profilePhoto: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      status: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      }
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ 'contacts.user': 1 });

// Add methods
UserSchema.methods.addContact = async function(userId, nickname = null) {
  const existingContact = this.contacts.find(
    contact => contact.user.toString() === userId.toString()
  );
  
  if (!existingContact) {
    this.contacts.push({
      user: userId,
      nickname,
      blocked: false,
      muted: false
    });
    await this.save();
  }
};

UserSchema.methods.blockContact = async function(userId) {
  const contactIndex = this.contacts.findIndex(
    contact => contact.user.toString() === userId.toString()
  );
  
  if (contactIndex !== -1) {
    this.contacts[contactIndex].blocked = true;
    await this.save();
  }
};

UserSchema.methods.unblockContact = async function(userId) {
  const contactIndex = this.contacts.findIndex(
    contact => contact.user.toString() === userId.toString()
  );
  
  if (contactIndex !== -1) {
    this.contacts[contactIndex].blocked = false;
    await this.save();
  }
};

const User = mongoose.model('User', UserSchema);

module.exports = User;