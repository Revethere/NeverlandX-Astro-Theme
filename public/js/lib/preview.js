mixins.preview = {
    data() {
        return { previewShow: false };
    },
    created() {
        this.renderers.push(this.preview);
    },
    methods: {
        preview() {
            let preview = this.$refs.preview,
                content = this.$refs.previewContent;

            // Delegated on the document instead of bound per image: the Moments
            // stream appends entries after load, and those photos should open the
            // preview too. The overlay's own image is skipped, so a click there
            // falls through to the overlay handler below and closes it.
            document.addEventListener("click", (event) => {
                let image = event.target instanceof Element ? event.target.closest("img") : null;
                if (!image || preview.contains(image)) return;
                content.alt = image.alt;
                content.src = image.src;
                this.previewShow = true;
            });

            preview.addEventListener("click", () => {
                this.previewShow = false;
            });

            window.addEventListener("resize", () => {
                this.previewShow = false;
            });
        },
    },
};
