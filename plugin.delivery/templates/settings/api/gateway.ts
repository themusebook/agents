import { createSolanaClawdPluginGateway } from '@openclawd/chat-plugins-gateway';

export const config = {
  runtime: 'edge',
};

export default createSolanaClawdPluginGateway();

