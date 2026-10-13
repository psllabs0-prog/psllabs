"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Expand, X } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { ProductArtworkNotice } from "./product-artwork-notice";

import styles from "./product-artwork-dialog.module.css";

type ProductArtworkDialogProps = {
  src: string;
  alt: string;
  name: string;
  strength?: string;
  triggerLabel?: string;
};

export function ProductArtworkDialog({ src, alt, name, strength, triggerLabel }: ProductArtworkDialogProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const productName = `${name}${strength ? ` ${strength}` : ""}`;

  return (
    <Dialog.Root>
      <Dialog.Trigger
        ref={trigger}
        className={`${styles.enlarge}${triggerLabel ? ` ${styles.labelledTrigger}` : ""}`}
        aria-label={triggerLabel ? `View ${productName} original artwork` : `Enlarge ${productName} image`}
        title={triggerLabel ? `View ${productName} original artwork` : `Enlarge ${productName} image`}
      >
        <Expand size={17} strokeWidth={1.6} aria-hidden />
        <span className={styles.enlargeLabel}>{triggerLabel ?? "Enlarge"}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.zoomBackdrop} />
        <Dialog.Popup
          className={styles.zoomDialog}
          initialFocus={closeButton}
          finalFocus={trigger}
        >
          <div className={styles.zoomHeader}>
            <div className={styles.zoomHeading}>
              <Dialog.Title className={styles.zoomTitle}>
                {name}
                {strength ? <span className={styles.zoomStrength}> {strength}</span> : null}
              </Dialog.Title>
              {triggerLabel ? <p className={styles.viewerLabel}>Original artwork</p> : null}
            </div>
            <Dialog.Close ref={closeButton} className={styles.zoomClose} aria-label="Close enlarged image">
              <X size={21} strokeWidth={1.6} aria-hidden />
            </Dialog.Close>
          </div>
          <div className={styles.zoomImageFrame}>
            {/* Original asset plus scale-down preserves its available resolution. */}
            <Image src={src} alt={alt} fill unoptimized className={styles.zoomImage} />
          </div>
          <Dialog.Description className={styles.zoomDescription}>
            For laboratory research only. Not for human or veterinary use.
          </Dialog.Description>
          <ProductArtworkNotice imageSrc={src} className={styles.labelNotice} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
