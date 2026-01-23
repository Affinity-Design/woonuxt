<script setup lang="ts">
/**
 * Toast Container Component
 * Displays toast notifications in a stack
 */

const {toasts, removeToast} = useToast();

// Icon mapping for toast types
const icons: Record<string, string> = {
  success: 'ion:checkmark-circle',
  error: 'ion:alert-circle',
  warning: 'ion:warning',
  info: 'ion:information-circle',
};

// Color classes for toast types
const colorClasses: Record<string, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-yellow-500 text-gray-900',
  info: 'bg-blue-600 text-white',
};

const borderClasses: Record<string, string> = {
  success: 'border-green-700',
  error: 'border-red-700',
  warning: 'border-yellow-600',
  info: 'border-blue-700',
};
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast">
        <div v-for="toast in toasts" :key="toast.id" :class="['toast', colorClasses[toast.type], borderClasses[toast.type]]" role="alert">
          <div class="toast-content">
            <Icon :name="icons[toast.type]" class="toast-icon" />
            <p class="toast-message">{{ toast.message }}</p>
          </div>
          <button type="button" class="toast-close" @click="removeToast(toast.id)" aria-label="Dismiss notification">
            <Icon name="ion:close" class="w-4 h-4" />
          </button>
          <!-- Progress bar for auto-dismiss -->
          <div v-if="toast.duration && toast.duration > 0" class="toast-progress" :style="{animationDuration: `${toast.duration}ms`}" />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 420px;
  width: 100%;
  pointer-events: none;
}

@media (max-width: 480px) {
  .toast-container {
    top: 0.5rem;
    right: 0.5rem;
    left: 0.5rem;
    max-width: none;
  }
}

.toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-radius: 0.5rem;
  border-left: 4px solid;
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  pointer-events: auto;
  overflow: hidden;
}

.toast-content {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.toast-icon {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.toast-message {
  font-size: 0.9375rem;
  line-height: 1.5;
  margin: 0;
  word-break: break-word;
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin-left: 0.75rem;
  margin-top: -0.25rem;
  margin-right: -0.5rem;
  border-radius: 0.375rem;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.7;
  transition:
    opacity 0.15s,
    background-color 0.15s;
  flex-shrink: 0;
}

.toast-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.15);
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.4);
  animation: progress linear forwards;
  width: 100%;
}

@keyframes progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

/* Transition animations */
.toast-enter-active {
  animation: slideIn 0.3s ease-out;
}

.toast-leave-active {
  animation: slideOut 0.25s ease-in forwards;
}

.toast-move {
  transition: transform 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

@media (max-width: 480px) {
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-100%);
    }
  }
}
</style>
