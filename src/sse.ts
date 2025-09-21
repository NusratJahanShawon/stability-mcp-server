import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";

function getClientIp(req: Request): string {
	return (
		// Check X-Forwarded-For header first (when behind a proxy/load balancer)
		req.get("x-forwarded-for")?.split(",")[0] ||
		// Check X-Real-IP header (common with Nginx)
		req.get("x-real-ip") ||
		// Check req.ip (Express built-in, respects trust proxy setting)
		req.ip ||
		// Fallback to remoteAddress from the underlying socket
		req.socket.remoteAddress ||
		// Final fallback
		"unknown"
	);
}

export async function runSSEServer(server: Server) {
	let sseTransport: SSEServerTransport | null = null;
	const app = express();

	// Create uploads directory if it doesn't exist
	const uploadsDir = process.env.IMAGE_STORAGE_DIRECTORY || "/tmp/uploads";
	if (!fs.existsSync(uploadsDir)) {
		fs.mkdirSync(uploadsDir, { recursive: true });
	}

	// Configure multer for file uploads
	const storage = multer.diskStorage({
		destination: (req, file, cb) => {
			cb(null, uploadsDir);
		},
		filename: (req, file, cb) => {
			const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
			cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
		}
	});

	const upload = multer({ storage: storage });

	// Used to allow parsing of the body of the request
	app.use("/*", bodyParser.json());

	// Root route for better UX
	app.get("/", (req, res) => {
		res.json({
			status: "MCP Stability AI Server is running 🚀",
			endpoints: {
				sse: "/sse",
				messages: "/messages",
				health: "/health"
			},
			description: "This server provides Stability AI image processing tools via MCP protocol",
			timestamp: new Date().toISOString()
		});
	});

	// Handle POST requests to root (MCP protocol)
	app.post("/", (req, res) => {
		res.status(200).json({
			message: "MCP server is running. Use /sse for SSE transport or /messages for direct API calls.",
			endpoints: {
				sse: "/sse",
				messages: "/messages"
			}
		});
	});

	// Health check endpoint
	app.get("/health", (req, res) => {
		res.json({
			status: "healthy",
			service: "stability-ai-mcp-server",
			timestamp: new Date().toISOString()
		});
	});

	// Image upload endpoint
	app.post("/upload", upload.single('image'), (req, res) => {
		if (!req.file) {
			res.status(400).json({ error: "No image file provided" });
			return;
		}

		const fileUri = `file://${req.file.path}`;
		
		res.json({
			success: true,
			fileUri: fileUri,
			filename: req.file.filename,
			originalName: req.file.originalname,
			size: req.file.size
		});
	});

	app.get("/sse", async (req, res) => {
		sseTransport = new SSEServerTransport("/messages", res);
		await server.connect(sseTransport);

		res.on("close", () => {
			sseTransport = null;
		});
	});

	app.post("/messages", async (req: Request, res) => {
		if (sseTransport) {
			// Parse the body and add the IP address
			const body = req.body;
			const params = req.body.params || {};
			params._meta = {
				ip: getClientIp(req),
				headers: req.headers,
			};
			const enrichedBody = {
				...body,
				params,
			};

			await sseTransport.handlePostMessage(req, res, enrichedBody);
		} else {
			res.status(400).send("No active SSE connection");
		}
	});

	// Handle 404s for all other routes
	app.use((req, res) => {
		res.status(404).json({
			error: "Not Found",
			message: `Route ${req.method} ${req.path} not found`,
			timestamp: new Date().toISOString(),
		});
	});

	const port = process.env.PORT || 3020;
	app.listen(port, () => {
		console.error(
			`stability-ai MCP Server running on SSE at http://localhost:${port}`
		);
	});
}
