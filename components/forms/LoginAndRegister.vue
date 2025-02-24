<script setup lang="ts">
import VueTurnstile from "vue-turnstile"; // Remove curly braces :cite[2]:cite[7]

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const {
  loginUser,
  isPending,
  registerUser,
  sendResetPasswordEmail,
  loginClients,
} = useAuth();
const turnstileToken = ref<string>("");
const turnstileMounted = ref(false);
const turnstileSiteKey = useRuntimeConfig();
const turnstileError = ref<string>("");

if (loginClients.value === null) getLoginClients();

const userInfo = ref<UserInfo>({
  email: "",
  password: "",
  username: "",
  rememberMe: false,
  turnstileToken: "", // Add this
});

const formView = ref("login");
const message = ref("");
const errorMessage = ref("");

const verifyTurnstile = async () => {
  turnstileError.value = "";
  if (!turnstileToken.value) {
    turnstileError.value = "Please complete the security check";
    return false;
    // return true; // for testing
  }
  return true;
};

const updateFormView = () => {
  if (route.query.action === "forgotPassword") {
    formView.value = "forgotPassword";
  } else if (route.query.action === "register") {
    formView.value = "register";
  } else {
    formView.value = "login";
  }
};
watch(route, updateFormView, { immediate: true });

const login = async (credentials: UserInfo) => {
  // Update parameter name for clarity
  const { success, error } = await loginUser(credentials);
  switch (error) {
    case "invalid_username":
      errorMessage.value = t("messages.error.invalidUsername");
      break;
    case "incorrect_password":
      errorMessage.value = t("messages.error.incorrectPassword");
      break;
    default:
      errorMessage.value = error;
      break;
  }

  if (success) {
    errorMessage.value = "";
    message.value = t("messages.account.loggingIn");
  }
};

const handleFormSubmit = async () => {
  // Add Turnstile verification
  if (!(await verifyTurnstile())) return;

  // Use spread with latest token value
  const credentials = {
    ...userInfo.value,
    turnstileToken: turnstileToken.value, // Direct ref access
  };

  if (formView.value === "register") {
    const { success, error } = await registerUser(credentials);
    if (success) {
      errorMessage.value = "";
      message.value =
        t("messages.account.accountCreated") +
        " " +
        t("messages.account.loggingIn");
      setTimeout(() => {
        login(credentials);
      }, 2000);
    } else {
      errorMessage.value = error;
    }
  } else if (formView.value === "forgotPassword") {
    resetPassword(credentials);
  } else {
    await login(credentials);
  }
};

const resetPassword = async (payload: { email: string }) => {
  const { success, error } = await sendResetPasswordEmail({
    username: payload.email,
  });
  if (success) {
    errorMessage.value = "";
    message.value = t("messages.account.ifRegistered");
  } else {
    errorMessage.value = error;
  }
};

const navigate = (view: string) => {
  formView.value = view;
  if (view === "forgotPassword") {
    router.push({ query: { action: "forgotPassword" } });
  } else if (view === "register") {
    router.push({ query: { action: "register" } });
  } else {
    router.push({ query: {} });
  }
};

const formTitle = computed(() => {
  if (formView.value === "login") {
    return t("messages.account.loginToAccount");
  } else if (formView.value === "register") {
    return t("messages.account.accountRegister");
  } else if (formView.value === "forgotPassword") {
    return t("messages.account.forgotPassword");
  }
});

const buttonText = computed(() => {
  if (formView.value === "login") {
    return t("messages.account.login");
  } else if (formView.value === "register") {
    return t("messages.account.register");
  } else if (formView.value === "forgotPassword") {
    return t("messages.account.sendPasswordResetEmail");
  }
});

const emailLabel = computed(() =>
  formView.value === "register"
    ? t("messages.billing.email")
    : t("messages.account.emailOrUsername")
);
const usernameLabel = computed(() =>
  formView.value === "login"
    ? t("messages.account.emailOrUsername")
    : t("messages.account.username")
);
const passwordLabel = computed(() => t("messages.account.password"));

const inputPlaceholder = computed(() => {
  return {
    email: "johndoe@email.com",
    username: formView.value === "login" ? "johndoe@email.com" : "johndoe",
    password: "********",
  };
});
</script>

<template>
  <div class="max-w-lg mx-auto my-16 min-h-[600px] text-center">
    <Logo />
    <div class="flex flex-col my-2">
      <h1 class="text-xl font-semibold lg:text-3xl">{{ formTitle }}</h1>
      <p class="text-gray-500 mt-2">Welcome back! Select method to login.</p>
    </div>

    <LoginProviders
      class="my-8"
      v-if="formView === 'login' || formView === 'register'"
    />

    <form class="mt-6" @submit.prevent="handleFormSubmit">
      <div
        v-if="formView === 'register' || formView === 'forgotPassword'"
        for="email"
      >
        <input
          id="email"
          v-model="userInfo.email"
          :placeholder="inputPlaceholder.email"
          autocomplete="email"
          type="text"
          required
        />
      </div>
      <p v-if="formView === 'forgotPassword'" class="text-sm text-gray-500">
        {{ $t("messages.account.enterEmailOrUsernameForReset") }}
      </p>
      <div v-if="formView !== 'forgotPassword'">
        <input
          class="mt-1"
          v-model="userInfo.username"
          :placeholder="inputPlaceholder.username"
          autocomplete="username"
          type="text"
          required
        />

        <PasswordInput
          className="border rounded-lg w-full p-3 px-4 bg-white mt-1"
          v-model="userInfo.password"
          :placeholder="passwordLabel"
          :autocomplete="
            formView === 'login' ? 'current-password' : 'new-password'
          "
          :required="true"
        />
      </div>

      <Transition name="scale-y" mode="out-in">
        <div
          v-if="message"
          class="my-4 text-sm text-green-500"
          v-html="message"
        ></div>
      </Transition>
      <Transition name="scale-y" mode="out-in">
        <div
          v-if="errorMessage"
          class="my-4 text-sm text-red-500"
          v-html="errorMessage"
        ></div>
      </Transition>

      <div class="flex items-center justify-between mt-4">
        <label class="flex items-center gap-2"
          ><input v-model="userInfo.rememberMe" type="checkbox" />Remember me
        </label>
        <div
          class="font-semibold cursor-pointer text-sm text-primary hover:text-primary"
          @click="navigate('forgotPassword')"
          v-if="formView === 'login'"
        >
          Forgot password?
        </div>
      </div>

      <!-- Login button -->
      <button class="flex items-center justify-center gap-4 my-6 text-lg">
        <LoadingIcon v-if="isPending" stroke="4" size="16" color="#fff" />
        <span>{{ buttonText }}</span>
      </button>
    </form>

    <div v-if="formView === 'login'" class="my-6 text-center">
      {{ $t("messages.account.noAccount") }}
      <a
        class="font-semibold cursor-pointer text-primary"
        @click="navigate('register')"
      >
        {{ $t("messages.account.accountRegister") }} </a
      >.
    </div>

    <div v-if="formView === 'register'" class="my-2 text-center justify-center">
      {{ $t("messages.account.hasAccount") }}
      <a
        class="font-semibold cursor-pointer text-primary"
        @click="navigate('login')"
      >
        {{ $t("messages.general.please") }}
        {{ $t("messages.account.accountLogin") }}
      </a>
    </div>

    <div
      class="my-8 text-center cursor-pointer"
      @click="navigate('login')"
      v-if="formView === 'forgotPassword'"
    >
      {{ $t("messages.account.backToLogin") }}
    </div>

    <!-- TURNSTYLE -->
    <div class="my-4">
      <ClientOnly>
        <VueTurnstile
          v-if="formView === 'login' || formView === 'register'"
          :site-key="turnstileSiteKey.public.turnstyleSiteKey"
          v-model="turnstileToken"
          @verify="
            () => {
              turnstileMounted = true;
              // Add token availability check
              if (!turnstileToken) console.error('No token after mount');
            }
          "
          @error="
            () => {
              turnstileError = 'Security check failed - please try again';
            }
          "
          :reset-interval="30000"
        />
        <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
          {{ turnstileError }}
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
input[type="text"],
input[type="password"],
button {
  @apply border rounded-lg mb-4 w-full p-3 px-4 bg-white;
}

form button {
  @apply rounded-lg font-bold bg-gray-800 text-white py-3 px-8 hover:bg-gray-800;
}
</style>
