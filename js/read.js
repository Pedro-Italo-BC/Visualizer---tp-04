const ReadArquivo = (() => {

    function read(entidadeId) {

        const entidade =
            EntidadeStorage.buscarPorId(entidadeId);

        console.log("READ:", entidade);

        if (!entidade) {
            throw new Error("Entidade não encontrada.");
        }

        console.log(
            "REGISTROS:",
            entidade.registros
        );

        return entidade.registros || [];
    }

    return {
        read
    };

})();