import {useAuth} from "~/composables/useAuth";

export default defineNuxtRouteMiddleware(() => {
    const { isAuthed } = useAuth();
    if (!isAuthed.value) return navigateTo("/login");
});
