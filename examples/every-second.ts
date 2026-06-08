import { schedule } from "../src/index.js";

console.log(
	"Starting — printing timestamp every second. Press Ctrl+C to stop.\n",
);

const handle = schedule()
	.every()
	.seconds()
	.run(() => {
		console.log(new Date().toISOString());
	});

process.on("SIGINT", () => {
	handle.stop();
	console.log("\nStopped.");
	process.exit(0);
});
