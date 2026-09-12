import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Ohne globals-Modus räumt Testing Library nicht automatisch auf.
afterEach(cleanup);
