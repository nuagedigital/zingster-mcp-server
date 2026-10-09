import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// ============================================================
// CONFIG
// ============================================================
const MENU_API_URL = process.env.MENU_API_URL || ''; // Optional: set to fetch live menu

// ============================================================
// REAL ZINGSTER'S MENU (from zingsters-staging.nuage-digital.com)
// ============================================================
const MENU = {
  nashville_hot_chicken: {
    label: '🔥 Nashville Hot Chicken',
    items: [
      {
        id: 'nch-1',
        name: 'Classic Hot Chicken Sandwich',
        price: 12.99,
        description: 'Nashville hot fried chicken, pickles, on a brioche bun',
        heat: ['Plain', 'Mild', 'Medium', 'Hot', 'Nashville Hot'],
      },
      {
        id: 'nch-2',
        name: 'Deluxe Hot Chicken Sandwich',
        price: 14.99,
        description: 'Nashville hot chicken with coleslaw and pickles',
        heat: ['Plain', 'Mild', 'Medium', 'Hot', 'Nashville Hot'],
      },
    ],
  },

  burgers: {
    label: '🍔 Smash Burgers',
    items: [
      {
        id: 'brg-1',
        name: 'Classic Smash',
        price: 10.99,
        description: 'Single smash patty, cheese, pickles, special sauce',
      },
      {
        id: 'brg-2',
        name: 'Double Smash',
        price: 13.99,
        description: 'Double smash patties, double cheese, pickles, sauce',
      },
      {
        id: 'brg-3',
        name: 'Bacon Smash',
        price: 14.99,
        description: 'Smash patty with crispy bacon, cheese, pickles, sauce',
      },
    ],
  },

  wraps: {
    label: '🌯 Wraps',
    items: [
      {
        id: 'wrp-1',
        name: 'Hot Chicken Wrap',
        price: 11.99,
        description: 'Nashville hot chicken wrapped with slaw and pickles',
        heat: ['Plain', 'Mild', 'Medium', 'Hot', 'Nashville Hot'],
      },
      {
        id: 'wrp-2',
        name: 'Smash Burger Wrap',
        price: 11.99,
        description: 'Smash patty, cheese, lettuce, sauce in a wrap',
      },
    ],
  },

  rice_bowls: {
    label: '🍚 Rice Bowls',
    items: [
      {
        id: 'ric-1',
        name: 'Nashville Hot Chicken Bowl',
        price: 13.99,
        description: 'Hot chicken over seasoned rice with pickles',
        heat: ['Plain', 'Mild', 'Medium', 'Hot', 'Nashville Hot'],
      },
      {
        id: 'ric-2',
        name: 'Smash Burger Bowl',
        price: 13.99,
        description: 'Smash patty over rice with cheese and sauce',
      },
    ],
  },

  fries: {
    label: '🍟 Fries',
    items: [
      {
        id: 'fry-1',
        name: 'Classic Fries',
        price: 3.99,
        description: 'Hand-cut fries with house seasoning',
      },
      {
        id: 'fry-2',
        name: 'Cajun Fries',
        price: 4.99,
        description: '⭐ Customer favorite — crispy fries with cajun spice',
        note: 'Customer favorite',
      },
      {
        id: 'fry-3',
        name: 'Loaded Fries',
        price: 6.99,
        description: 'Fries topped with cheese, meat, and sauce',
      },
    ],
  },
};

const HOURS: Record<string, string> = {
  monday: '11:00 AM - 10:00 PM',
  tuesday: '11:00 AM - 10:00 PM',
  wednesday: '11:00 AM - 10:00 PM',
  thursday: '11:00 AM - 10:00 PM',
  friday: '11:00 AM - 11:00 PM',
  saturday: '11:00 AM - 11:00 PM',
  sunday: '11:00 AM - 9:00 PM',
};

const callbacks: Record<string, unknown>[] = [];
const orders: Record<string, unknown>[] = [];

// ============================================================
// HELPER: Flatten menu for searching
// ============================================================
function flatMenu() {
  return Object.values(MENU).flatMap(group =>
    group.items.map(item => ({ ...item, category: group.label }))
  );
}

// ============================================================
// HELPER: Optional — fetch menu from external API
// ============================================================
async function fetchExternalMenu() {
  if (!MENU_API_URL) return null;
  try {
    const res = await fetch(MENU_API_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ============================================================
// MCP SERVER
// ============================================================
const server = new Server(
  { name: 'zingster-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_menu',
      description: 'Get the full Zingster\'s menu with prices and descriptions',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_menu_item',
      description: 'Search for a specific menu item by name',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Item name to search for' },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_hours',
      description: 'Get restaurant opening hours',
      inputSchema: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'Day of week (optional)' },
        },
        required: [],
      },
    },
    {
      name: 'place_order',
      description: 'Place a pickup order. Collect items and customer name before calling.',
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Item name exactly as in menu' },
                quantity: { type: 'number' },
                heat: { type: 'string', description: 'Heat level if applicable' },
              },
              required: ['name', 'quantity'],
            },
          },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          pickupTime: { type: 'string' },
        },
        required: ['items', 'customerName'],
      },
    },
    {
      name: 'request_callback',
      description: 'Save a callback request so staff can call the customer',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['name', 'phone'],
      },
    },
    {
      name: 'is_halal',
      description: 'Check if the restaurant is halal',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      // ---------------- get_menu ----------------
      case 'get_menu': {
        // Try external fetch first
        const external = await fetchExternalMenu();
        const menuData = external || MENU;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(menuData, null, 2),
          }],
        };
      }

      // ---------------- get_menu_item ----------------
      case 'get_menu_item': {
        const { name: n } = z.object({ name: z.string() }).parse(args);
        const found = flatMenu().find(i =>
          i.name.toLowerCase().includes(n.toLowerCase())
        );
        return {
          content: [{
            type: 'text',
            text: found
              ? JSON.stringify(found, null, 2)
              : `No item found matching "${n}". Available: ${flatMenu().map(i => i.name).join(', ')}`,
          }],
        };
      }

      // ---------------- get_hours ----------------
      case 'get_hours': {
        const { day } = z.object({ day: z.string().optional() }).parse(args);
        if (day) {
          const h = HOURS[day.toLowerCase()];
          return {
            content: [{
              type: 'text',
              text: h ? `${day}: ${h}` : `No hours found for ${day}`,
            }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(HOURS, null, 2) }],
        };
      }

      // ---------------- place_order ----------------
      case 'place_order': {
        const o = z.object({
          items: z.array(z.object({
            name: z.string(),
            quantity: z.number(),
            heat: z.string().optional(),
          })),
          customerName: z.string(),
          customerPhone: z.string().optional(),
          pickupTime: z.string().optional(),
        }).parse(args);

        // Validate items exist in menu & calculate total
        const flat = flatMenu();
        const orderItems = o.items.map(it => {
          const menuItem = flat.find(m =>
            m.name.toLowerCase() === it.name.toLowerCase() ||
            m.name.toLowerCase().includes(it.name.toLowerCase())
          );
          return {
            name: menuItem?.name || it.name,
            quantity: it.quantity,
            heat: it.heat,
            price: menuItem?.price || 0,
            found: !!menuItem,
          };
        });

        const total = orderItems.reduce((s, it) => s + (it.price * it.quantity), 0);
        const orderId = 'ZG-' + Date.now().toString().slice(-6);

        const orderRecord = {
          orderId,
          items: orderItems,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          pickupTime: o.pickupTime || 'ASAP',
          total: total.toFixed(2),
          createdAt: new Date().toISOString(),
        };

        orders.push(orderRecord);
        console.log('[ORDER]', JSON.stringify(orderRecord, null, 2));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              orderId,
              estimatedTotal: `$${total.toFixed(2)}`,
              pickupTime: orderRecord.pickupTime,
              customerName: o.customerName,
              items: orderItems,
              note: orderItems.some(i => !i.found)
                ? '⚠️ Some items not found in menu — confirm with customer'
                : 'All items verified from menu',
            }, null, 2),
          }],
        };
      }

      // ---------------- request_callback ----------------
      case 'request_callback': {
        const r = z.object({
          name: z.string(),
          phone: z.string(),
          reason: z.string().optional(),
        }).parse(args);

        callbacks.push({ ...r, at: new Date().toISOString() });
        console.log('[CALLBACK]', r);

        return {
          content: [{
            type: 'text',
            text: `Got it, ${r.name}. We'll call you at ${r.phone} shortly.`,
          }],
        };
      }

      // ---------------- is_halal ----------------
      case 'is_halal': {
        return {
          content: [{
            type: 'text',
            text: 'Yes — Zingster\'s is 100% halal. All meat is zabiha halal.',
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: 'Unknown tool: ' + name }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: 'Error: ' + message }],
      isError: true,
    };
  }
});

// ============================================================
// EXPRESS HTTP SERVER
// ============================================================
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
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Admin endpoint — view all orders
app.get('/orders', (_req, res) => {
  res.json({ count: orders.length, orders });
});

// Admin endpoint — view callbacks
app.get('/callbacks', (_req, res) => {
  res.json({ count: callbacks.length, callbacks });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Zingster MCP Server on http://localhost:${PORT}/mcp`);
  console.log(`🍔 ${flatMenu().length} menu items loaded`);
});
