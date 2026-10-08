import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const MENU = {
  hot_chicken: [
    { id: 'hc-1', name: 'Classic Hot Chicken Sandwich', price: 12.99, heat: ['Plain','Mild','Medium','Hot','Nashville'] },
    { id: 'hc-2', name: 'Deluxe Hot Chicken Sandwich', price: 14.99, heat: ['Plain','Mild','Medium','Hot','Nashville'] },
  ],
  smash_burgers: [
    { id: 'sb-1', name: 'Classic Smash', price: 10.99 },
    { id: 'sb-2', name: 'Double Smash', price: 13.99 },
    { id: 'sb-3', name: 'Bacon Smash', price: 14.99 },
  ],
  fries: [
    { id: 'fr-1', name: 'Classic Fries', price: 3.99 },
    { id: 'fr-2', name: 'Cajun Fries', price: 4.99, note: 'favorite' },
    { id: 'fr-3', name: 'Loaded Fries', price: 6.99 },
  ],
  wraps: [
    { id: 'wr-1', name: 'Chicken Wrap', price: 11.99 },
    { id: 'wr-2', name: 'Burger Wrap', price: 11.99 },
  ],
  bowls: [
    { id: 'rw-1', name: 'Nashville Chicken Bowl', price: 13.99 },
    { id: 'rw-2', name: 'Smash Burger Bowl', price: 13.99 },
  ],
};

const HOURS = {
  monday: '11:00 AM - 10:00 PM',
  tuesday: '11:00 AM - 10:00 PM',
  wednesday: '11:00 AM - 10:00 PM',
  thursday: '11:00 AM - 10:00 PM',
  friday: '11:00 AM - 11:00 PM',
  saturday: '11:00 AM - 11:00 PM',
  sunday: '11:00 AM - 9:00 PM',
};

const callbacks = [];

const server = new Server(
  { name: 'zingster-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'get_menu', description: 'Get full menu', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_menu_item', description: 'Get item by name', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    { name: 'get_hours', description: 'Get hours', inputSchema: { type: 'object', properties: { day: { type: 'string' } }, required: [] } },
    { name: 'place_order', description: 'Place pickup order', inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, quantity: { type: 'number' }, heat: { type: 'string' } }, required: ['name', 'quantity'] } }, customerName: { type: 'string' }, customerPhone: { type: 'string' }, pickupTime: { type: 'string' } }, required: ['items', 'customerName'] } },
    { name: 'request_callback', description: 'Request callback', inputSchema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, reason: { type: 'string' } }, required: ['name', 'phone'] } },
    { name: 'is_halal', description: 'Is it halal?', inputSchema: { type: 'object', properties: {}, required: [] } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case 'get_menu':
        return { content: [{ type: 'text', text: JSON.stringify({ menu: MENU }, null, 2) }] };
      case 'get_menu_item': {
        const { name: n } = z.object({ name: z.string() }).parse(args);
        const found = Object.values(MENU).flat().find(i => i.name.toLowerCase().includes(n.toLowerCase()));
        return { content: [{ type: 'text', text: found ? JSON.stringify(found, null, 2) : 'No item ' + n }] };
      }
      case 'get_hours': {
        const { day } = z.object({ day: z.string().optional() }).parse(args);
        if (day) {
          const h = HOURS[day.toLowerCase()];
          return { content: [{ type: 'text', text: h ? day + ': ' + h : 'No hours for ' + day }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(HOURS, null, 2) }] };
      }
      case 'place_order': {
        const o = z.object({ items: z.array(z.object({ name: z.string(), quantity: z.number(), heat: z.string().optional() })), customerName: z.string(), customerPhone: z.string().optional(), pickupTime: z.string().optional() }).parse(args);
        const orderId = 'ZG-' + Date.now().toString().slice(-6);
        const total = o.items.reduce((s, it) => { const m = Object.values(MENU).flat().find(x => x.name === it.name); return s + ((m?.price || 0) * it.quantity); }, 0);
        console.log('[ORDER]', orderId, o);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, orderId, estimatedTotal: total.toFixed(2), pickupTime: o.pickupTime || 'ASAP', items: o.items }, null, 2) }] };
      }
      case 'request_callback': {
        const r = z.object({ name: z.string(), phone: z.string(), reason: z.string().optional() }).parse(args);
        callbacks.push({ ...r, at: new Date().toISOString() });
        console.log('[CALLBACK]', r);
        return { content: [{ type: 'text', text: 'Got it, ' + r.name + '. We will call you at ' + r.phone + ' shortly.' }] };
      }
      case 'is_halal':
        return { content: [{ type: 'text', text: 'Yes - 100% halal.' }] };
      default:
        return { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: 'Error: ' + err.message }], isError: true };
  }
});

const app = express();
app.use(express.json());

const API_KEY = process.env.MCP_API_KEY || '';
app.use((req, res, next) => {
  if (API_KEY && req.headers['authorization'] !== 'Bearer ' + API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MCP Server on http://localhost:' + PORT + '/mcp'));
