// Zero preserves the existing unlimited-quota convention. Reject coercion.
module.exports=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=2147483647;
