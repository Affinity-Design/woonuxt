<script setup lang="ts">
import VueTurnstile from 'vue-turnstile'; // Remove curly braces :cite[2]:cite[7]

const {t} = useI18n();
const route = useRoute();
const router = useRouter();
const {loginUser, isPending, registerUser, sendResetPasswordEmail, loginClients} = useAuth();
const turnstileToken = ref<string>('');
const turnstileMounted = ref(false);
const turnstileSiteKey = useRuntimeConfig();
const turnstileError = ref<string>('');

if (loginClients.value === null) getLoginClients();

const userInfo = ref<UserInfo>({
  email: '',
  password: '',
  username: '',
  rememberMe: false,
  turnstileToken: '', // Add this
  twoFactorCode: '', // Wordfence 2FA passthrough (accounts with 2FA enabled)
});

const formView = ref('login');
const message = ref('');
const errorMessage = ref('');
const needsTwoFactor = ref(false);

// Wordfence Login Security passthrough: GraphQL JSON bodies never populate $_POST, so Wordfence
// would never see a 2FA token. We append the code to the password as "<password>#wfls#<code>";
// a WP-side snippet (docs/wordfence-2fa-headless-passthrough.md) splits it off before GraphQL
// executes and exposes it as $_POST['wfls-token'] — Wordfence still does ALL validation.
const WFLS_MARKER = '#wfls#';

const verifyTurnstile = async () => {
  turnstileError.value = '';
  if (!turnstileToken.value) {
    turnstileError.value = 'Please complete the security check';
    return false;
    // return true; // for testing
  }
  return true;
};

const updateFormView = () => {
  if (route.query.action === 'forgotPassword') {
    formView.value = 'forgotPassword';
  } else if (route.query.action === 'register') {
    formView.value = 'register';
  } else {
    formView.value = 'login';
  }
};
watch(route, updateFormView, {immediate: true});

const login = async (credentials: Pick<UserInfo, 'username' | 'password' | 'turnstileToken' | 'twoFactorCode'>) => {
  // Construct an exact allowlist so additional form fields can never enter GraphQL variables.
  const code = credentials.twoFactorCode?.trim();
  const payload = {
    username: credentials.username,
    password: code ? `${credentials.password}${WFLS_MARKER}${code}` : credentials.password,
    turnstileToken: credentials.turnstileToken,
  };

  const {success, error: publicErrorMessage} = await loginUser(payload);
  errorMessage.value = publicErrorMessage || '';

  // Wordfence rejections mention the 2FA/authenticator code — surface the field prominently.
  if (!success && /2fa|two.?factor|authenticat|verification code|wfls/i.test(String(publicErrorMessage || ''))) {
    needsTwoFactor.value = true;
  }

  if (success) {
    errorMessage.value = '';
    needsTwoFactor.value = false;
    message.value = t('messages.account.loggingIn');
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

  if (formView.value === 'register') {
    const {
      success,
      signedIn,
      error: publicErrorMessage,
    } = await registerUser({
      email: credentials.email,
      password: credentials.password,
      turnstileToken: credentials.turnstileToken,
    });

    if (!success) {
      // Nothing was created — never claim otherwise.
      message.value = '';
      errorMessage.value = publicErrorMessage || '';
      return;
    }

    errorMessage.value = '';

    // registerCustomer already returned a session; the account view takes over
    // as soon as `viewer` is set, so there is nothing left to announce.
    if (signedIn) {
      message.value = t('messages.account.accountCreated');
      return;
    }

    // No token came back with the payload — sign in explicitly. Read the token
    // ref again rather than reusing the captured one: Turnstile tokens are
    // single-use, and the widget may have refreshed since the form was posted.
    message.value = t('messages.account.accountCreated') + ' ' + t('messages.account.loggingIn');
    await login({
      username: credentials.email,
      password: credentials.password,
      turnstileToken: turnstileToken.value,
      twoFactorCode: '',
    });

    // The account exists either way, so send the customer to the login form
    // instead of leaving a success and a failure on screen at the same time.
    if (errorMessage.value) {
      message.value = '';
      errorMessage.value = t('messages.account.accountCreatedSignIn');
      userInfo.value.username = credentials.email;
      navigate('login');
    }
  } else if (formView.value === 'forgotPassword') {
    resetPassword(credentials);
  } else {
    await login(credentials);
  }
};

const resetPassword = async (payload: {email: string}) => {
  const {success, error: publicErrorMessage} = await sendResetPasswordEmail({
    username: payload.email,
  });
  if (success) {
    errorMessage.value = '';
    message.value = t('messages.account.ifRegistered');
  } else {
    errorMessage.value = publicErrorMessage || '';
  }
};

const navigate = (view: string) => {
  formView.value = view;
  if (view === 'forgotPassword') {
    router.push({query: {action: 'forgotPassword'}});
  } else if (view === 'register') {
    router.push({query: {action: 'register'}});
  } else {
    router.push({query: {}});
  }
};

const formTitle = computed(() => {
  if (formView.value === 'login') {
    return t('messages.account.loginToAccount');
  } else if (formView.value === 'register') {
    return t('messages.account.accountRegister');
  } else if (formView.value === 'forgotPassword') {
    return t('messages.account.forgotPassword');
  }
});

const buttonText = computed(() => {
  if (formView.value === 'login') {
    return t('messages.account.login');
  } else if (formView.value === 'register') {
    return t('messages.account.register');
  } else if (formView.value === 'forgotPassword') {
    return t('messages.account.sendPasswordResetEmail');
  }
});

const emailLabel = computed(() => (formView.value === 'register' ? t('messages.billing.email') : t('messages.account.emailOrUsername')));
const usernameLabel = computed(() => (formView.value === 'login' ? t('messages.account.emailOrUsername') : t('messages.account.username')));
const passwordLabel = computed(() => t('messages.account.password'));

const inputPlaceholder = computed(() => {
  return {
    email: 'johndoe@email.com',
    username: formView.value === 'login' ? 'johndoe@email.com' : 'johndoe',
    password: '********',
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

    <LoginProviders class="my-8" v-if="formView === 'login' || formView === 'register'" />

    <form class="mt-6" @submit.prevent="handleFormSubmit">
      <div v-if="formView === 'register' || formView === 'forgotPassword'" for="email">
        <input id="email" v-model="userInfo.email" :placeholder="inputPlaceholder.email" autocomplete="email" type="text" required />
      </div>
      <p v-if="formView === 'forgotPassword'" class="text-sm text-gray-500">
        {{ $t('messages.account.enterEmailOrUsernameForReset') }}
      </p>
      <div v-if="formView !== 'forgotPassword'">
        <input
          v-if="formView === 'login'"
          class="mt-1"
          v-model="userInfo.username"
          :placeholder="inputPlaceholder.username"
          autocomplete="username"
          type="text"
          required />

        <PasswordInput
          className="border rounded-lg w-full p-3 px-4 bg-white mt-1"
          v-model="userInfo.password"
          :placeholder="passwordLabel"
          :autocomplete="formView === 'login' ? 'current-password' : 'new-password'"
          :required="true" />

        <!-- Wordfence 2FA passthrough — only accounts with 2FA enabled need this field. -->
        <div v-if="formView === 'login'" class="text-left">
          <input
            v-model="userInfo.twoFactorCode"
            class="mt-1"
            :class="{'border-yellow-500 ring-1 ring-yellow-400': needsTwoFactor && !userInfo.twoFactorCode}"
            placeholder="2FA code (only if your account uses one)"
            autocomplete="one-time-code"
            type="text"
            maxlength="32" />
          <p v-if="needsTwoFactor" class="-mt-2 mb-4 text-sm text-yellow-600">
            This account requires two-factor authentication — enter the 6-digit code from your authenticator app (or a recovery code) and sign in again.
          </p>
        </div>
      </div>

      <Transition name="scale-y" mode="out-in">
        <div v-if="message" class="my-4 text-sm text-green-500">{{ message }}</div>
      </Transition>
      <Transition name="scale-y" mode="out-in">
        <div v-if="errorMessage" class="my-4 text-sm text-red-500">{{ errorMessage }}</div>
      </Transition>

      <div class="flex items-center justify-between mt-4">
        <label class="flex items-center gap-2"><input v-model="userInfo.rememberMe" type="checkbox" />Remember me </label>
        <div class="font-semibold cursor-pointer text-sm text-primary hover:text-primary" @click="navigate('forgotPassword')" v-if="formView === 'login'">
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
      {{ $t('messages.account.noAccount') }}
      <a class="font-semibold cursor-pointer text-primary" @click="navigate('register')"> {{ $t('messages.account.accountRegister') }} </a>.
    </div>

    <div v-if="formView === 'register'" class="my-2 text-center justify-center">
      {{ $t('messages.account.hasAccount') }}
      <a class="font-semibold cursor-pointer text-primary" @click="navigate('login')">
        {{ $t('messages.general.please') }}
        {{ $t('messages.account.accountLogin') }}
      </a>
    </div>

    <div class="my-8 text-center cursor-pointer" @click="navigate('login')" v-if="formView === 'forgotPassword'">
      {{ $t('messages.account.backToLogin') }}
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
          :reset-interval="30000" />
        <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
          {{ turnstileError }}
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
input[type='text'],
input[type='password'],
button {
  @apply border rounded-lg mb-4 w-full p-3 px-4 bg-white;
}

form button {
  @apply rounded-lg font-bold bg-gray-800 text-white py-3 px-8 hover:bg-gray-800;
}
</style>
