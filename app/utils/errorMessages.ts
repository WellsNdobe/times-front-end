// app/utils/errorMessages.ts
type AnyObj = Record<string, any>

export type UiError = {
    title: string
    message: string
    code?: string
}

/**
 * Normalizes Nuxt/Vite/Nitro/$fetch/Network errors into friendly text.
 */
export function toUiError(err: unknown): UiError {
    const e = err as AnyObj

    // Common $fetch error shape: { status, statusMessage, data }
    const status = e?.status ?? e?.response?.status
    const data = e?.data ?? e?.response?._data ?? e?.response?.data

    // Network / CORS / backend down
    if (!status) {
        return {
            title: "Connection problem",
            message: "We could not reach the server. Check your internet connection and try again.",
            code: "NETWORK",
        }
    }

    if (status === 401) {
        return {
            title: "Session expired",
            message: "You need to sign in again to continue.",
            code: "UNAUTHORIZED",
        }
    }

    if (status === 403) {
        return {
            title: "Access denied",
            message: "Your account does not have permission to do that.",
            code: "FORBIDDEN",
        }
    }

    if (status === 429) {
        return {
            title: "Too many attempts",
            message: "Please wait a moment and try again.",
            code: "RATE_LIMIT",
        }
    }

    if (status >= 500) {
        return {
            title: "Server error",
            message: "Something went wrong on our side. Please try again in a bit.",
            code: "SERVER_ERROR",
        }
    }

    const backendMsg =
        typeof data?.message === "string"
            ? data.message
            : typeof e?.statusMessage === "string"
                ? e.statusMessage
                : null

    if (backendMsg && backendMsg.length <= 160) {
        return {
            title: "Request failed",
            message: backendMsg,
            code: String(status),
        }
    }

    return {
        title: "Request failed",
        message: "Please try again.",
        code: String(status),
    }
}
